import { createConversation, getConversationById, updateConversationStage, addMessage } from "./conversations.js";
import { createProjectRecord, getProjectById, persistRequirementsJson, persistSolutionJson, persistSpecialistBriefs, persistBomJson, approveProject, updateProjectName, persistDiagram } from "./projects.js";
import { getVendorPreferences } from "./user-preferences.js";
import { normalizeIntakePayload } from "./intake.js";
import { runDiscoveryAgent } from "../agents/discovery.js";
import { runSolutionAgent } from "../agents/solution.js";
import { runAllSpecialists } from "../agents/specialist.js";
import { runBomAgent } from "../agents/bom.js";
import { runProposalAgent } from "../agents/proposal.js";
import { checkBudgetOverrun } from "./budget.js";
import { validateGate1, extractBomGroundingWarnings } from "./validation.js";
import { validateHciComputeDrives, validateBackupServer, validateSwitchAddition } from "./sizing-validator.js";
import { generateTextWithOpenAI } from "./openai.js";
import { getKnowledge } from "../agents/solution.js";
import { getWikiPagesForRequirements } from "../lib/db/wiki.js";
import { generateDiagramFromSolution } from "./diagram-generator.js";
import { getMessagesByConversation } from "./conversations.js";
import { config } from "./config.js";

const PIPELINE_TIMEOUT_MS = 300000;

export async function withTimeout(fn, ms = PIPELINE_TIMEOUT_MS) {
  return Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Pipeline timeout — กรุณาลองใหม่อีกครั้ง")), ms)
    )
  ]);
}

function formatSolutionOptions(solution) {
  const options = Array.isArray(solution) ? solution : (solution?.options ?? []);
  const narrative = !Array.isArray(solution) ? (solution?.thai_narrative ?? null) : null;
  if (options.length === 0) {
    return "## Solution Options\n\nNo options generated.";
  }

  const lines = ["## Solution Options\n"];
  if (narrative) {
    lines.push(narrative, "\n---\n");
  }
  options.forEach((opt, i) => {
    const name = opt.name ?? opt.title ?? `Option ${i + 1}`;
    const desc = opt.description ?? opt.summary ?? "";
    lines.push(`${i + 1}. **${name}**${desc ? ` - ${desc}` : ""}`);
    if (opt.components && Array.isArray(opt.components)) {
      opt.components.slice(0, 3).forEach((c) => {
        lines.push(`   - ${typeof c === "string" ? c : (c.name ?? JSON.stringify(c))}`);
      });
    }
  });
  lines.push("\nPlease reply with the number of the option you'd like to proceed with.");
  return lines.join("\n");
}

function cleanBomText(value) {
  return String(value ?? "")
    .replace(/\[(.*?) from KB\]/gi, (_, subject) => `ต้องยืนยัน ${String(subject).toLowerCase()} กับ distributor`)
    .replace(/\[(.*?)\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatPresaleBom(bom) {
  const rows = Array.isArray(bom?.rows) ? bom.rows : [];
  const sections = [
    { key: "[Compute]", title: "[Compute]" },
    { key: "[Storage]", title: "[Storage]" },
    { key: "[Network]", title: "[Network]" },
    { key: "[Licensing]", title: "[Licensing]" },
    { key: "[Support & Warranty]", title: "[Support & Warranty]" }
  ];

  const grouped = new Map(sections.map((section) => [section.key, []]));
  const fallbackRows = [];

  rows.forEach((row) => {
    const rawCategory = String(row.category ?? "");
    const category = cleanBomText(rawCategory);
    const description = cleanBomText(row.description);
    const notes = cleanBomText(row.notes);
    const cleanedRow = { category, description, notes, qty: row.qty ?? 1 };
    const catKey = rawCategory.toLowerCase().replace(/[\[\]]/g, "").trim();
    const normalizedCategory = sections.find((section) => {
      const sectKey = section.title.toLowerCase().replace(/[\[\]]/g, "").trim();
      if (catKey === sectKey) return true;
      if (sectKey === "support & warranty") return /support|warranty|maintenance|service/.test(catKey);
      if (sectKey === "licensing") return /licens|subscription|software/.test(catKey);
      if (sectKey === "compute") return /compute|server|node|cpu/.test(catKey);
      if (sectKey === "storage") return /storage|disk|nvme|ssd|hdd|san|nas/.test(catKey);
      if (sectKey === "network") return /network|switch|nic|cable|fabric/.test(catKey);
      return catKey.includes(sectKey) || sectKey.includes(catKey);
    });
    if (normalizedCategory) {
      grouped.get(normalizedCategory.key).push(cleanedRow);
    } else {
      fallbackRows.push(cleanedRow);
    }
  });

  const explanations = Array.isArray(bom?.thai_explanations) ? bom.thai_explanations : [];

  const lines = [
    "## Bill of Materials",
    "",
    "_ราคาไม่รวมในเอกสารนี้ — กรุณาส่ง BOM ให้ distributor เพื่อขอราคา_",
    ""
  ];

  for (const section of sections) {
    const sectionRows = grouped.get(section.key) ?? [];
    if (sectionRows.length === 0) continue;
    lines.push(`### ${section.title}`);
    sectionRows.forEach((row, idx) => {
      const noteSuffix = row.notes ? ` — ${row.notes}` : "";
      lines.push(`- ${row.description} | Qty ${row.qty}${noteSuffix}`);
      const explanation = explanations.find(e => e.row_index === idx);
      if (explanation?.explanation) {
        lines.push(`  ↳ ${explanation.explanation}`);
      }
    });
    lines.push("");
  }

  if (fallbackRows.length > 0) {
    lines.push("### [Other]");
    fallbackRows.forEach((row) => {
      const noteSuffix = row.notes ? ` — ${row.notes}` : "";
      lines.push(`- ${row.description} | Qty ${row.qty}${noteSuffix}`);
    });
    lines.push("");
  }

  if (Array.isArray(bom?.notes) && bom.notes.length > 0) {
    lines.push("**หมายเหตุ:**");
    bom.notes.forEach((note) => {
      const cleaned = cleanBomText(note);
      if (cleaned) lines.push(`- ${cleaned}`);
    });
    lines.push("");
  }

  return lines.join("\n").trim();
}

function formatBomAndProposal(bom, project, selectedOption) {
  const lines = [formatPresaleBom(bom), ""];

  if (selectedOption?.estimated_tco_thb) {
    const tco = Number(selectedOption.estimated_tco_thb).toLocaleString("en-US");
    lines.push(`## ราคาประมาณการ (Estimated TCO)`);
    lines.push("");
    lines.push(`**~฿${tco} THB** (3-year horizon, hardware + software license, ไม่รวมค่าติดตั้ง/บริการ)`);
    lines.push("");
    lines.push("_ตัวเลขนี้เป็นประมาณการจาก presale assistant — ราคาจริงต้องยืนยันกับ distributor_");
    lines.push("");
  }

  if (project?.proposal_url) {
    lines.push(`## Proposal Ready\n\nYour proposal document is available at: \`${project.proposal_url}\``);
  } else if (project?.status === "bom_complete") {
    lines.push("## รอการตรวจสอบ\n\nBOM สร้างเรียบร้อยแล้ว กรุณาตรวจสอบข้อสังเกตด้านล่างก่อนดำเนินการต่อ");
  } else {
    lines.push("## Proposal Generated\n\nProposal ถูกสร้างเรียบร้อยแล้ว กรุณาติดต่อ administrator เพื่อรับเอกสาร");
  }

  return lines.join("\n");
}

function extractCustomerName(message) {
  const m1 = message.match(/บริษั(?:ท)?\s+.+?จำกัด(?:\s*\(มหาชน\))?/);
  if (m1) return m1[0].trim();
  const m2 = message.match(/บริษั(?:ท)?\s+\S+/);
  if (m2) return m2[0].trim();
  const m3 = message.match(/ห้างหุ้นส่วน(?:จำกัด)?\s+\S+/);
  if (m3) return m3[0].trim();
  const m4 = message.match(/(?:โรงงาน|โรงพยาบาล|มหาวิทยาลัย|ธนาคาร|โรงแรม|โรงเรียน|สำนักงาน|องค์กร|หน่วยงาน|ลูกค้า)\s*\S+/);
  if (m4) return m4[0].trim();
  return null;
}

async function handleGreeting({ message, userId, orgId }) {
  return withTimeout(async () => {
    const intake = normalizeIntakePayload({
      customer_name: extractCustomerName(message) || "Chat Project",
      partner_type: "System Integrator",
      primary_use_case: message,
      core_pain_point: message,
      desired_outcome: message,
      trust_priority: "Reliability",
      notes: message
    });

    const created = await createProjectRecord(intake, userId, orgId);
    const projectId = created.project.id;

    const conv = await createConversation(projectId, userId, orgId);
    const conversationId = conv.conversation.id;

    await addMessage(conversationId, "user", message);

    const { question_text, hints } = await runDiscoveryAgent(intake, {
      projectId,
      mode: "generate_questions"
    });
    await addMessage(conversationId, "assistant", question_text);
    await updateConversationStage(conversationId, "discovery_questions");

    return {
      conversation_id: conversationId,
      project_id: projectId,
      stage: "discovery_questions",
      text: question_text,
      hints: hints ?? [],
      created: true
    };
  });
}

async function handleDiscoveryQuestions({ conversation, conversationId, message, userId, onProgress }) {
  return withTimeout(async () => {
    await addMessage(conversationId, "user", message);

    const project = await getProjectById(conversation.project_id);

    let intake = project.intake_json;
    let discoveryReply = message;

    if (project.requirements_json) {
      const existingReq = project.requirements_json;
      const existingParts = [];
      const vmCount = existingReq.scale?.vm_count ?? existingReq.vm_count;
      const storageTb = existingReq.scale?.storage_tb ?? existingReq.storage_tb;
      const budget = existingReq.budget_thb ?? existingReq.budget_range_thb;
      if (vmCount) existingParts.push(`VM count: ${vmCount}`);
      if (storageTb) existingParts.push(`Storage: ${storageTb} TB`);
      if (budget) existingParts.push(`Budget: ${budget} THB`);
      if (existingReq.constraints?.length) existingParts.push(`Constraints: ${existingReq.constraints.join(", ")}`);
      const existingContext = existingParts.length ? `\n[Existing requirements — preserve if not overridden by new message: ${existingParts.join("; ")}]` : "";
      intake = normalizeIntakePayload({
        customer_name: extractCustomerName(message) || project.intake_json?.customer_name || "Chat Project",
        partner_type: project.intake_json?.partner_type || "System Integrator",
        primary_use_case: message,
        core_pain_point: message,
        desired_outcome: message,
        trust_priority: project.intake_json?.trust_priority || "Reliability",
        notes: message + existingContext
      });
    } else {
      const allMessages = await getMessagesByConversation(conversationId);
      const userMessages = allMessages.filter(m => m.role === "user").map(m => m.content);
      if (userMessages.length > 1) {
        discoveryReply = userMessages.join("\n\n");
      }
    }

    const _pStart = Date.now();
    const _el = () => Date.now() - _pStart;
    onProgress?.(1, 3, "กำลังวิเคราะห์ความต้องการ...");
    console.log(`[pipeline:discovery] +${_el()}ms started`);
    const requirements = await runDiscoveryAgent(intake, {
      projectId: conversation.project_id,
      mode: "parse_answers",
      discoveryReply
    });
    console.log(`[pipeline:discovery] +${_el()}ms done`);
    await persistRequirementsJson(conversation.project_id, requirements);

    // Gate 1: Discovery → Solution — block pipeline if critical fields are missing
    const gate1Gaps = validateGate1(requirements);
    if (gate1Gaps.length > 0) {
      const gapText = gate1Gaps.map((g) => `- ${g}`).join("\n");
      const questionText = `ขอบคุณครับ ยังขาดข้อมูลสำคัญบางส่วนก่อนออกแบบ solution:\n\n${gapText}\n\nกรุณาแจ้งข้อมูลเพิ่มเติมเหล่านี้ครับ`;
      await addMessage(conversationId, "assistant", questionText);
      await updateConversationStage(conversationId, "discovery_questions");
      return {
        conversation_id: conversationId,
        project_id: conversation.project_id,
        stage: "discovery_questions",
        text: questionText,
        created: false
      };
    }

    // MEM-01: Rename project from discovery output
    const customerName = requirements.customer_profile?.name;
    const category = requirements.category;
    const projectName = customerName
      ? `${customerName} — ${category || "Project"}`
      : `${category || "Project"} ${new Date().toISOString().slice(0, 10)}`;
    await updateProjectName(conversation.project_id, projectName);

    // MEM-03: Fetch vendor preferences (DB-saved)
    const vendorPrefs = await getVendorPreferences(userId);

    // Extract vendor mentions from ALL text sources — intake original message is the most reliable
    const VENDOR_KEYWORDS = {
      dell: "Dell", hpe: "HPE", lenovo: "Lenovo", nutanix: "Nutanix",
      cisco: "Cisco", veeam: "Veeam", proxmox: "Proxmox", vmware: "VMware",
      fortinet: "Fortinet", commvault: "Commvault", supermicro: "Supermicro"
    };
    const DISLIKED_KEYWORDS = {
      vmware: "VMware"  // explicit dislike patterns
    };
    // Scan: (1) original intake message, (2) discovery reply, (3) parsed constraints
    const searchText = [
      intake?.primary_use_case,
      intake?.notes,
      intake?.core_pain_point,
      message,
      ...(requirements.constraints ?? [])
    ].filter(Boolean).join(" ").toLowerCase();

    // Detect explicit rejections (ไม่เอา, avoid, exclude)
    const rejectPatterns = /ไม่เอา|ไม่ใช้|หลีกเลี่ยง|avoid|exclude|no\s+vmware/;
    for (const [key, name] of Object.entries(DISLIKED_KEYWORDS)) {
      if (rejectPatterns.test(searchText) && searchText.includes(key)) {
        if (!vendorPrefs.disliked.includes(name)) vendorPrefs.disliked.push(name);
      }
    }

    // Extract preferred vendors — exclude any that were disliked
    for (const [key, name] of Object.entries(VENDOR_KEYWORDS)) {
      if (vendorPrefs.disliked.includes(name)) continue;
      if (searchText.includes(key)) {
        if (!vendorPrefs.preferred.includes(name)) vendorPrefs.preferred.push(name);
      }
    }

    if (vendorPrefs.preferred.length > 0 || vendorPrefs.disliked.length > 0) {
      requirements.vendor_preferences = vendorPrefs;
      if (!requirements.constraints) requirements.constraints = [];
      if (vendorPrefs.preferred.length > 0) {
        requirements.constraints.push(`Vendor preferences (MUST honor — customer explicitly requested): ${vendorPrefs.preferred.join(", ")}`);
      }
      if (vendorPrefs.disliked.length > 0) {
        requirements.constraints.push(`Vendors to AVOID — customer explicitly rejected: ${vendorPrefs.disliked.join(", ")}`);
      }
    }

    const summaryLines = ["**สรุปความต้องการที่รับทราบ:**"];
    const sc = requirements.scale ?? {};
    const cp = requirements.customer_profile ?? {};
    if (cp.name) summaryLines.push(`- ลูกค้า: ${cp.name}`);
    if (requirements.category) summaryLines.push(`- Use case: ${requirements.category}`);
    if (sc.vm_count != null) summaryLines.push(`- VM: ${sc.vm_count} ตัว`);
    if (sc.storage_tb != null) summaryLines.push(`- Storage: ${sc.storage_tb} TB usable`);
    if (requirements.explicit_fields?.users && sc.users != null) summaryLines.push(`- Users: ${sc.users} คน`);
    if (requirements.budget_range) summaryLines.push(`- งบ: ${requirements.budget_range}`);
    const constraints = (requirements.constraints ?? []).filter(Boolean);
    if (constraints.length > 0) summaryLines.push(`- ข้อกำหนด: ${constraints.join(", ")}`);
    const assumptionPrefix = summaryLines.join("\n") + "\n\n";

    onProgress?.(2, 3, "ผู้เชี่ยวชาญกำลัง review...");
    console.log(`[pipeline:specialists] +${_el()}ms started`);
    const specialistBriefs = await runAllSpecialists(requirements, { projectId: conversation.project_id });
    console.log(`[pipeline:specialists] +${_el()}ms done count=${specialistBriefs.length}`);
    await persistSpecialistBriefs(conversation.project_id, specialistBriefs);
    onProgress?.(3, 3, "กำลังออกแบบ solution...");
    console.log(`[pipeline:solution] +${_el()}ms started`);
    const solution = await runSolutionAgent(requirements, { projectId: conversation.project_id, specialistBriefs });
    console.log(`[pipeline:solution] +${_el()}ms done options=${solution.options?.length}`);
    await persistSolutionJson(conversation.project_id, solution);

    await updateConversationStage(conversationId, "awaiting_selection");

    const responseText = assumptionPrefix + formatSolutionOptions(solution);
    await addMessage(conversationId, "assistant", responseText);

    return {
      conversation_id: conversationId,
      project_id: conversation.project_id,
      stage: "awaiting_selection",
      text: responseText,
      created: false
    };
  });
}

async function handleAwaitingSelection({ conversation, conversationId, message, onProgress }) {
  return withTimeout(async () => {
    await addMessage(conversationId, "user", message);
    const _pStart = Date.now();
    const _el = () => Date.now() - _pStart;

    const project = await getProjectById(conversation.project_id);
    const solution = project?.solution_json;
    if (!solution || typeof solution !== "object") {
      throw new Error("Solution not found for this project. Please start a new chat.");
    }
    const solutionOptions = Array.isArray(solution) ? solution : (Array.isArray(solution.options) ? solution.options : []);
    const maxIndex = Math.max(solutionOptions.length, 1);

    const numMatch = message.match(/(\d+)/);
    let selectedIndex = numMatch ? parseInt(numMatch[1], 10) : 0;
    let vendorPreference = null;

    if (!numMatch && solutionOptions.length > 0) {
      const lower = message.toLowerCase();
      // Only match on hardware/platform vendors — not software (Veeam, etc.) to avoid false positives
      const HW_VENDORS = ["nutanix", "dell", "hpe", "cisco ucs", "lenovo", "supermicro", "simplivity", "vxrail"];
      const textMatch = solutionOptions.findIndex((opt) => {
        const name = (opt.name ?? "").toLowerCase();
        const vendors = (opt.vendor_stack ?? []).map((v) => v.toLowerCase());
        const hwVendors = vendors.filter(v => HW_VENDORS.some(hw => v.includes(hw)));
        return lower.includes(name) || hwVendors.some((v) => lower.includes(v));
      });

      if (textMatch >= 0) {
        selectedIndex = textMatch + 1;
      } else {
        // User mentioned a vendor not in current options — re-run solution with preference
        vendorPreference = message.trim();
        selectedIndex = 1; // tentative, will be overridden after re-run
      }
    }

    if (vendorPreference) {
      const requirements = project.requirements_json
        ? { ...project.requirements_json, constraints: [...(project.requirements_json.constraints ?? []), `Vendor preference: ${vendorPreference}`] }
        : null;

      if (requirements) {
        const specialistBriefs = await runAllSpecialists(requirements, { projectId: conversation.project_id });
        const newSolution = await runSolutionAgent(requirements, { projectId: conversation.project_id, specialistBriefs });
        await persistSolutionJson(conversation.project_id, newSolution);

        const updatedProject = await getProjectById(conversation.project_id);
        const responseText = `เข้าใจครับ ขอออกแบบใหม่ตามที่ต้องการ\n\n` + formatSolutionOptions(newSolution);
        await addMessage(conversationId, "assistant", responseText);
        return {
          conversation_id: conversationId,
          project_id: conversation.project_id,
          stage: "awaiting_selection",
          text: responseText,
          created: false
        };
      }
    }

    selectedIndex = Math.max(1, Math.min(selectedIndex, maxIndex));

    const solutionWithSelection = Array.isArray(solution)
      ? { options: solution, selected_option: selectedIndex - 1 }
      : { ...solution, options: solutionOptions, selected_option: selectedIndex - 1 };

    await persistSolutionJson(conversation.project_id, solutionWithSelection);
    onProgress?.(1, 4, "กำลังสร้าง BOM...");
    console.log(`[pipeline:bom] +${_el()}ms started`);
    const bom = await runBomAgent(solutionWithSelection, {
      specialistBriefs: project.specialist_briefs_json,
      requirements: project.requirements_json,
      onProgress
    });
    console.log(`[pipeline:bom] +${_el()}ms done rows=${bom.rows?.length}`);

    // Gate checks
    const groundingWarnings = extractBomGroundingWarnings(bom);
    const selectedOption = solutionWithSelection.options?.[solutionWithSelection.selected_option ?? 0];
    const chatBudgetWarning = checkBudgetOverrun(
      selectedOption?.estimated_tco_thb,
      project.requirements_json?.budget_range
    );

    const resolvedTopology = selectedOption?.topology
      ?? (selectedOption?.architecture?.match(/\b(HCI|3-Tier|Hybrid)\b/i)?.[1]);
    const hciDriveChecks = validateHciComputeDrives(bom.rows ?? [], resolvedTopology);
    const backupServerChecks = validateBackupServer(bom.rows ?? [], selectedOption);
    const switchChecks = validateSwitchAddition(bom.rows ?? [], project.requirements_json?.existing_infrastructure);
    const architectureWarnings = [
      ...hciDriveChecks.warnings,
      ...backupServerChecks.warnings,
      ...switchChecks.warnings
    ];

    const hasBlockers = groundingWarnings.length > 0 || !!chatBudgetWarning || architectureWarnings.length > 0;

    // Format BOM response
    const cleanBom = { ...bom, rows: (bom.rows ?? []).filter(r => r.category !== "GROUNDING WARNING") };
    const groundingNotice = groundingWarnings.length > 0
      ? `\n\n⚠️ **GROUNDING WARNING** — พบ ${groundingWarnings.length} รายการที่ model ไม่อยู่ใน Knowledge Base:\n` +
        groundingWarnings.map((r) => `- ${r.description}`).join("\n") +
        "\n_กรุณาตรวจสอบรายการเหล่านี้ก่อน generate proposal_"
      : "";
    const budgetNotice = chatBudgetWarning ? `\n\n⚠️ **${chatBudgetWarning}**` : "";
    const architectureNotice = architectureWarnings.length > 0
      ? `\n\n⚠️ **ARCHITECTURE / BOM SANITY** — พบ ${architectureWarnings.length} ประเด็นที่ต้องแก้ก่อน generate proposal:\n` +
        architectureWarnings.map((w) => `- ${w}`).join("\n")
      : "";
    const responseText = formatBomAndProposal(cleanBom, { status: "bom_complete" }, selectedOption) + groundingNotice + budgetNotice + architectureNotice;

    const settle = (promise, label, timeoutMs = 10_000) => Promise.race([
      promise.then(
        (value) => ({ ok: true, value }),
        (error) => ({ ok: false, error })
      ),
      new Promise((resolve) => setTimeout(() => resolve({ ok: false, timeout: true }), timeoutMs))
    ]).then((result) => {
      if (result.ok) return result.value;
      if (result.timeout) {
        console.warn(`[chat:bom] ${label} timed out after ${timeoutMs}ms`);
        return null;
      }
      console.warn(`[chat:bom] ${label} failed: ${result.error.message}`);
      return null;
    });

    let diagramMermaid = null;
    let diagramExplanation = null;
    try {
      const diagramResult = await generateDiagramFromSolution({
        solution: solutionWithSelection,
        bom,
        requirements: project.requirements_json
      });
      diagramMermaid = diagramResult.mermaidCode;
      diagramExplanation = diagramResult.thaiExplanation ?? null;
      settle(persistDiagram(conversation.project_id, diagramMermaid), "persistDiagram");
    } catch (err) {
      console.error(`[chat:bom] diagram generation failed: ${err.message}`);
    }

    onProgress?.(2, 4, "กำลังบันทึก BOM...");
    const saveAssistantState = async () => {
      await Promise.all([
        settle(persistBomJson(conversation.project_id, bom), "persistBomJson"),
        settle(updateConversationStage(conversationId, "complete"), "updateConversationStage"),
        settle(addMessage(conversationId, "assistant", responseText), "addMessage")
      ]);

      if (!hasBlockers) {
        const resolvedName = project.requirements_json?.customer_profile?.name || project.intake_json?.customer_name;
        const proposalIntake = { ...project.intake_json, customer_name: resolvedName || project.intake_json?.customer_name };
        try {
          await approveProject(conversation.project_id);
          await runProposalAgent(
            proposalIntake,
            project.requirements_json,
            solutionWithSelection,
            bom,
            { projectId: conversation.project_id, budgetWarning: chatBudgetWarning }
          );
          await updateConversationStage(conversationId, "complete");
          console.log(`[proposal:bg] done project=${conversation.project_id}`);
        } catch (err) {
          console.error(`[proposal:bg] failed project=${conversation.project_id}: ${err.message}`);
        }
      }
    };

    setImmediate(() => {
      saveAssistantState().catch((error) => {
        console.error(`[chat:bom] background save failed: ${error.message}`);
      });
    });

    return {
      conversation_id: conversationId,
      project_id: conversation.project_id,
      stage: "bom",
      text: responseText,
      diagram_mermaid: diagramMermaid,
      diagram_explanation: diagramExplanation,
      grounding_warnings: groundingWarnings.length,
      created: false
    };
  });
}

function isQuestion(message) {
  return /\?|ทำไม|อธิบาย|ความแตกต่าง|ต่างกัน|เหมาะ|ดีกว่า|แนะนำ|ควร|เป็นยังไง|คืออะไร|หมายความ|เพราะ|อย่างไร|ยังไง|ช่วยอธิบาย|รายละเอียด|ข้อดี|ข้อเสีย|เปรียบเทียบ/.test(message);
}

async function handleFreeformQA({ conversation, conversationId, message }) {
  return withTimeout(async () => {
    await addMessage(conversationId, "user", message);
    const project = await getProjectById(conversation.project_id);
    const stage = conversation.stage;

    const contextParts = [];
    if (project?.requirements_json) {
      const r = project.requirements_json;
      const summary = [
        r.customer_profile?.name && `ลูกค้า: ${r.customer_profile.name}`,
        r.category && `Use case: ${r.category}`,
        r.scale?.vm_count != null && `VM: ${r.scale.vm_count}`,
        r.scale?.storage_tb != null && `Storage: ${r.scale.storage_tb} TB`,
        r.budget_range && `งบ: ${r.budget_range}`,
        r.constraints?.length && `ข้อกำหนด: ${r.constraints.filter(Boolean).join(", ")}`
      ].filter(Boolean).join("\n");
      contextParts.push(`## Customer Requirements\n${summary}`);
    }
    if (project?.solution_json) {
      contextParts.push(`## Solution Options\n${formatSolutionOptions(project.solution_json)}`);
    }
    if (project?.bom_json && stage === "complete") {
      const rows = (project.bom_json?.rows ?? []).filter(r => r.category !== "GROUNDING WARNING");
      contextParts.push(`## BOM (${rows.length} items)\n${rows.slice(0, 15).map(r => `- [${r.category}] ${r.description} x${r.qty}`).join("\n")}`);
    }

    const [history, kbChunks, wikiPages] = await Promise.all([
      getMessagesByConversation(conversationId),
      getKnowledge({ use_cases: [message] }).catch(() => []),
      getWikiPagesForRequirements({ use_cases: [message] }).catch(() => [])
    ]);
    const historyText = history
      .slice(-8)
      .map(m => `${m.role === "user" ? "Presale" : "AI"}: ${m.content.slice(0, 400)}`)
      .join("\n");

    if (wikiPages.length > 0) {
      contextParts.push(`## Product Wiki\n${wikiPages.map(p => `- **${p.product_name}** (${p.vendor}): ${p.overview}`).join("\n")}`);
    }

    if (kbChunks.length > 0) {
      contextParts.push(`## Knowledge Base\n${kbChunks.slice(0, 3).map(c => `**${c.title}**\n${c.content}`).join("\n\n")}`);
    }

    const selectionReminder = stage === "awaiting_selection"
      ? "\n\nหลังตอบคำถามแล้ว ให้ remind ลูกค้าให้เลือก option ด้วยการพิมพ์หมายเลข (1, 2, หรือ 3)"
      : "";

    const systemPrompt = `คุณเป็น IT Presale Expert ระดับอาวุโส เชี่ยวชาญ HCI, 3-Tier, Backup & Recovery, DR, Cybersecurity
ตอบเป็นภาษาไทย กระชับ ตรงประเด็น มีความเป็นมืออาชีพ ใช้ตัวเลขและ spec จริงเมื่อมีข้อมูล${selectionReminder}

${contextParts.join("\n\n")}`;

    const userPrompt = historyText
      ? `[บริบทการสนทนา]\n${historyText}\n\n[คำถาม]\n${message}`
      : message;

    const answer = await generateTextWithOpenAI({
      systemPrompt,
      userPrompt,
      model: config.openai.models.discovery,
      maxOutputTokens: 800,
      fallback: "ขออภัยครับ ไม่สามารถตอบได้ในขณะนี้"
    });

    await addMessage(conversationId, "assistant", answer);
    return {
      conversation_id: conversationId,
      project_id: conversation.project_id,
      stage,
      text: answer,
      created: false
    };
  });
}

function detectRevisionIntent(message) {
  const lower = message.toLowerCase();
  const tokens = lower.split(/\s+/);
  if (tokens.length < 2) return null;
  if (/ปรับ.*(requirement|ความต้องการ|spec|scale)|requirement.*ปรับ|แก้.*requirement|เปลี่ยน.*requirement/.test(lower)) return "requirements";
  if (/เปลี่ยน.*(solution|option|ตัวเลือก)|solution.*เปลี่ยน|ขอ.*option.*ใหม่/.test(lower)) return "solution";
  if (/เปลี่ยน.*(vendor|แบรนด์|ยี่ห้อ|บริษัท)|vendor.*เปลี่ยน/.test(lower)) return "vendor";
  if (/รุ่นล่าสุด|อัพเดต.*spec|update.*spec|spec.*ใหม่|latest.*model|ใช้.*รุ่น.*ใหม่|เปลี่ยน.*รุ่น/.test(lower)) return "spec_update";
  const TECH_NOUNS = /requirement|ความต้องการ|spec|scale|solution|option|ตัวเลือก|vendor|แบรนด์|ยี่ห้อ|บริษัท|รุ่น/;
  if (/แก้ไข|revision|ปรับ|modify|update|เปลี่ยน/.test(lower) && TECH_NOUNS.test(lower)) return "vendor";
  return null;
}

async function handleRevision({ conversation, conversationId, message, userId, intent }) {
  return withTimeout(async () => {
    await addMessage(conversationId, "user", message);
    const project = await getProjectById(conversation.project_id);

    if (intent === "requirements") {
      await updateConversationStage(conversationId, "discovery_questions");
      const questionText = "ครับ กรุณาแจ้ง requirement ใหม่ที่ต้องการปรับ ระบบจะออกแบบ solution ใหม่ให้";
      await addMessage(conversationId, "assistant", questionText);
      return {
        conversation_id: conversationId,
        project_id: conversation.project_id,
        stage: "discovery_questions",
        text: questionText,
        created: false
      };
    }

    if (intent === "solution") {
      await updateConversationStage(conversationId, "awaiting_selection");
      const solution = project?.solution_json;
      const responseText = "เข้าใจครับ นี่คือตัวเลือก solution ที่มี — กรุณาเลือกใหม่หรือบอก vendor ที่ต้องการ\n\n" + formatSolutionOptions(solution);
      await addMessage(conversationId, "assistant", responseText);
      return {
        conversation_id: conversationId,
        project_id: conversation.project_id,
        stage: "awaiting_selection",
        text: responseText,
        created: false
      };
    }

    // intent === "spec_update" — re-run solution+BOM using latest KB hardware models
    if (intent === "spec_update") {
      const requirements = project?.requirements_json
        ? { ...project.requirements_json, constraints: [...(project.requirements_json.constraints ?? []), "Use latest hardware generation as per current KB — do not use prior-gen models (R750→R760, R7525→R7625, Unity XT→PowerStore T-series)"] }
        : null;

      if (!requirements) {
        return {
          conversation_id: conversationId,
          project_id: conversation.project_id,
          stage: "complete",
          text: "ไม่พบ requirements เดิม กรุณาเริ่ม conversation ใหม่",
          created: false
        };
      }

      const specialistBriefs = await runAllSpecialists(requirements, { projectId: conversation.project_id });
      const newSolution = await runSolutionAgent(requirements, { projectId: conversation.project_id, specialistBriefs });
      await persistSolutionJson(conversation.project_id, newSolution);
      await updateConversationStage(conversationId, "awaiting_selection");

      const responseText = "อัพเดต spec เป็นรุ่นล่าสุดแล้วครับ\n\n" + formatSolutionOptions(newSolution);
      await addMessage(conversationId, "assistant", responseText);
      return {
        conversation_id: conversationId,
        project_id: conversation.project_id,
        stage: "awaiting_selection",
        text: responseText,
        created: false
      };
    }

    // intent === "vendor" — re-run solution with new vendor constraint
    const safeMessage = message.replace(/[\x00-\x1F\x7F]/g, " ").slice(0, 500);
    const requirements = project?.requirements_json
      ? { ...project.requirements_json, constraints: [...(project.requirements_json.constraints ?? []), `Revision request: ${safeMessage}`] }
      : null;

    if (!requirements) {
      return {
        conversation_id: conversationId,
        project_id: conversation.project_id,
        stage: "complete",
        text: "ไม่พบ requirements เดิม กรุณาเริ่ม conversation ใหม่",
        created: false
      };
    }

    const specialistBriefs = await runAllSpecialists(requirements, { projectId: conversation.project_id });
    const newSolution = await runSolutionAgent(requirements, { projectId: conversation.project_id, specialistBriefs });
    await persistSolutionJson(conversation.project_id, newSolution);
    await updateConversationStage(conversationId, "awaiting_selection");

    const responseText = "ออกแบบใหม่ตามที่ขอแล้วครับ\n\n" + formatSolutionOptions(newSolution);
    await addMessage(conversationId, "assistant", responseText);
    return {
      conversation_id: conversationId,
      project_id: conversation.project_id,
      stage: "awaiting_selection",
      text: responseText,
      created: false
    };
  });
}

export async function handleChatMessage({ conversationId, message, userId, orgId, onProgress }) {
  if (!conversationId) {
    try {
      return await handleGreeting({ message, userId, orgId });
    } catch (error) {
      return {
        conversation_id: conversationId ?? null,
        project_id: null,
        stage: "greeting",
        text: `เกิดข้อผิดพลาดระหว่าง discovery: ${error.message} — กรุณาลองใหม่อีกครั้ง`,
        created: false,
        ok: false
      };
    }
  }

  const conversation = await getConversationById(conversationId, orgId);
  if (!conversation) {
    return {
      conversation_id: conversationId,
      project_id: null,
      stage: "error",
      text: "ไม่พบ conversation — กรุณาเริ่น conversation ใหม่",
      created: false,
      ok: false
    };
  }

  if (orgId !== null && conversation.org_id !== null && conversation.org_id !== orgId) {
    return {
      conversation_id: conversationId,
      project_id: null,
      stage: "error",
      text: "ไม่มีสิทธิ์เข้าถึง conversation นี้",
      created: false,
      ok: false
    };
  }

  const stage = conversation.stage;

  if (stage === "complete") {
    const intent = detectRevisionIntent(message);
    if (intent) {
      try {
        return await handleRevision({ conversation, conversationId, message, userId, intent });
      } catch (error) {
        console.error("[chat] handleRevision error:", error);
        await addMessage(conversationId, "assistant", `เกิดข้อผิดพลาดระหว่างแก้ไข: ${error.message}`).catch(() => {});
        return {
          conversation_id: conversationId,
          project_id: conversation.project_id,
          stage: "complete",
          text: `เกิดข้อผิดพลาดระหว่างแก้ไข: ${error.message}`,
          created: false,
          ok: false
        };
      }
    }
    try {
      return await handleFreeformQA({ conversation, conversationId, message });
    } catch (error) {
      console.error("[chat] handleFreeformQA error:", error);
      return {
        conversation_id: conversationId,
        project_id: conversation.project_id,
        stage: "complete",
        text: `ขออภัยครับ เกิดข้อผิดพลาด: ${error.message}`,
        created: false,
        ok: false
      };
    }
  }

  if (stage === "discovery_questions") {
    try {
      return await handleDiscoveryQuestions({ conversation, conversationId, message, userId, onProgress });
    } catch (error) {
      await addMessage(conversationId, "assistant", `เกิดข้อผิดพลาดระหว่าง discovery: ${error.message} — กรุณาลองใหม่อีกครั้ง`).catch(() => {});
      return {
        conversation_id: conversationId,
        project_id: conversation.project_id,
        stage,
        text: `เกิดข้อผิดพลาดระหว่าง discovery: ${error.message} — กรุณาลองใหม่อีกครั้ง`,
        created: false,
        ok: false
      };
    }
  }

  if (stage === "awaiting_selection") {
    // Allow revision intents from stale revision strips even in awaiting_selection stage
    const intent = detectRevisionIntent(message);
    if (intent) {
      try {
        return await handleRevision({ conversation, conversationId, message, userId, intent });
      } catch (error) {
        await addMessage(conversationId, "assistant", `เกิดข้อผิดพลาดระหว่างแก้ไข: ${error.message}`).catch(() => {});
        return {
          conversation_id: conversationId,
          project_id: conversation.project_id,
          stage: "awaiting_selection",
          text: `เกิดข้อผิดพลาดระหว่างแก้ไข: ${error.message}`,
          created: false,
          ok: false
        };
      }
    }
    // Route free-form questions to Q&A instead of misinterpreting as selection
    if (isQuestion(message) && !message.match(/^\s*\d+\s*$/)) {
      try {
        return await handleFreeformQA({ conversation, conversationId, message });
      } catch (error) {
        return {
          conversation_id: conversationId,
          project_id: conversation.project_id,
          stage: "awaiting_selection",
          text: `ขออภัยครับ เกิดข้อผิดพลาด: ${error.message}`,
          created: false,
          ok: false
        };
      }
    }
    try {
      return await handleAwaitingSelection({ conversation, conversationId, message, onProgress });
    } catch (error) {
      await addMessage(conversationId, "assistant", `เกิดข้อผิดพลาดระหว่างเลือก option: ${error.message} — กรุณาลองใหม่อีกครั้ง`).catch(() => {});
      return {
        conversation_id: conversationId,
        project_id: conversation.project_id,
        stage,
        text: `เกิดข้อผิดพลาดระหว่างเลือก option: ${error.message} — กรุณาลองใหม่อีกครั้ง`,
        created: false,
        ok: false
      };
    }
  }

  return {
    conversation_id: conversationId,
    project_id: conversation.project_id,
    stage,
    text: `เกิดข้อผิดพลาด: stage "${stage}" ไม่ถูกต้อง — กรุณาเริ่ม conversation ใหม่`,
    created: false,
    ok: false
  };
}
