import { createConversation, getConversationById, updateConversationStage, addMessage } from "./conversations.js";
import { createProjectRecord, getProjectById, persistRequirementsJson, persistSolutionJson, persistBomJson, approveProject, updateProjectName, listProjectsByCustomerName, getRejectedOptionsByCustomer } from "./projects.js";
import { getVendorPreferences } from "./user-preferences.js";
import { normalizeIntakePayload } from "./intake.js";
import { runDiscoveryAgent } from "../agents/discovery.js";
import { runSolutionAgent } from "../agents/solution.js";
import { runAllSpecialists } from "../agents/specialist.js";
import { runBomAgent } from "../agents/bom.js";
import { runProposalAgent } from "../agents/proposal.js";

const PIPELINE_TIMEOUT_MS = 180000;

async function withTimeout(fn, ms = PIPELINE_TIMEOUT_MS) {
  return Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Pipeline timeout — กรุณาลองใหม่อีกครั้ง")), ms)
    )
  ]);
}

function formatSolutionOptions(solution) {
  const options = Array.isArray(solution) ? solution : (solution?.options ?? []);
  if (options.length === 0) {
    return "## Solution Options\n\nNo options generated.";
  }

  const lines = ["## Solution Options\n"];
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

function formatBomAndProposal(bom, project) {
  const rows = Array.isArray(bom?.rows) ? bom.rows : [];
  const lines = [
    "## Bill of Materials\n",
    "_ราคาไม่รวมในเอกสารนี้ — กรุณาส่ง BOM ให้ distributor เพื่อขอราคา_\n",
    "| Category | Description / Specification | Qty | Notes |",
    "| --- | --- | --- | --- |"
  ];

  if (rows.length > 0) {
    rows.forEach((row) => {
      const cat = row.category ?? "";
      const desc = row.description ?? "";
      const qty = row.qty ?? 1;
      const notes = row.notes ?? "";
      lines.push(`| ${cat} | ${desc} | ${qty} | ${notes} |`);
    });
  } else {
    lines.push("| — | — | — | — |");
  }

  if (Array.isArray(bom?.notes) && bom.notes.length > 0) {
    lines.push("\n**หมายเหตุ:**");
    bom.notes.forEach(n => lines.push(`- ${n}`));
  }

  lines.push("");

  if (project?.proposal_url) {
    lines.push(`## Proposal Ready\n\nYour proposal document is available at: \`${project.proposal_url}\``);
  } else {
    lines.push("## Proposal Generated\n\nYour proposal has been generated and saved. Please check with your administrator for the document.");
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
  return null;
}

async function handleGreeting({ message, userId }) {
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

    const created = await createProjectRecord(intake, userId);
    const projectId = created.project.id;

    const conv = await createConversation(projectId, userId);
    const conversationId = conv.conversation.id;

    await addMessage(conversationId, "user", message);

    const { question_text } = await runDiscoveryAgent(intake, {
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
      created: true
    };
  });
}

async function handleDiscoveryQuestions({ conversation, conversationId, message, userId }) {
  return withTimeout(async () => {
    await addMessage(conversationId, "user", message);

    const project = await getProjectById(conversation.project_id);
    const intake = project.intake_json;

    const requirements = await runDiscoveryAgent(intake, {
      projectId: conversation.project_id,
      mode: "parse_answers",
      discoveryReply: message
    });
    await persistRequirementsJson(conversation.project_id, requirements);

    // MEM-01: Rename project from discovery output
    const customerName = requirements.customer_profile?.name;
    const category = requirements.category;
    const projectName = customerName
      ? `${customerName} — ${category || "Project"}`
      : `${category || "Project"} ${new Date().toISOString().slice(0, 10)}`;
    await updateProjectName(conversation.project_id, projectName);

    // MEM-04: Check for duplicate customer projects
    let duplicateNotice = "";
    if (customerName) {
      const priorProjects = await listProjectsByCustomerName(userId, customerName);
      const others = priorProjects.filter(p => p.id !== conversation.project_id);
      if (others.length > 0) {
        const list = others.slice(0, 3).map(p => `${p.customer_name} (${p.created_at?.slice(0, 10)})`).join(", ");
        duplicateNotice = `_พบ proposal เก่าสำหรับลูกค้า "${customerName}" จำนวน ${others.length} รายการ: ${list}_\n\n`;
      }
    }

    // MEM-02: Fetch rejected options from prior projects
    if (customerName) {
      const rejectedOptions = await getRejectedOptionsByCustomer(userId, customerName);
      if (rejectedOptions.length > 0) {
        requirements.prior_rejected_options = rejectedOptions;
      }
    }

    // MEM-03: Fetch vendor preferences
    const vendorPrefs = await getVendorPreferences(userId);
    if (vendorPrefs.preferred.length > 0 || vendorPrefs.disliked.length > 0) {
      requirements.vendor_preferences = vendorPrefs;
      if (!requirements.constraints) requirements.constraints = [];
      if (vendorPrefs.preferred.length > 0) {
        requirements.constraints.push(`Preferred vendors: ${vendorPrefs.preferred.join(", ")}`);
      }
      if (vendorPrefs.disliked.length > 0) {
        requirements.constraints.push(`Disliked vendors (avoid if possible): ${vendorPrefs.disliked.join(", ")}`);
      }
    }

    const summaryLines = ["**สรุปความต้องการที่รับทราบ:**"];
    const sc = requirements.scale ?? {};
    const cp = requirements.customer_profile ?? {};
    if (cp.name) summaryLines.push(`- ลูกค้า: ${cp.name}`);
    if (requirements.category) summaryLines.push(`- Use case: ${requirements.category}`);
    if (sc.vm_count != null) summaryLines.push(`- VM: ${sc.vm_count} ตัว`);
    if (sc.storage_tb != null) summaryLines.push(`- Storage: ${sc.storage_tb} TB usable`);
    if (sc.users != null) summaryLines.push(`- Users: ${sc.users} คน`);
    if (requirements.budget_range) summaryLines.push(`- งบ: ${requirements.budget_range}`);
    const constraints = (requirements.constraints ?? []).filter(Boolean);
    if (constraints.length > 0) summaryLines.push(`- ข้อกำหนด: ${constraints.join(", ")}`);
    if (requirements.assumptions_applied?.length > 0) {
      summaryLines.push(`- สมมติฐาน (ข้อมูลที่ใช้ค่าเริ่มต้น): ${requirements.assumptions_applied.join(", ")}`);
    }
    const assumptionPrefix = summaryLines.join("\n") + "\n\n";

    const specialistBriefs = await runAllSpecialists(requirements, { projectId: conversation.project_id });
    const solution = await runSolutionAgent(requirements, { projectId: conversation.project_id, specialistBriefs });
    await persistSolutionJson(conversation.project_id, solution);

    await updateConversationStage(conversationId, "awaiting_selection");

    const responseText = duplicateNotice + assumptionPrefix + formatSolutionOptions(solution);
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

async function handleAwaitingSelection({ conversation, conversationId, message }) {
  return withTimeout(async () => {
    await addMessage(conversationId, "user", message);

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
      const textMatch = solutionOptions.findIndex((opt) => {
        const name = (opt.name ?? "").toLowerCase();
        const vendors = (opt.vendor_stack ?? []).map((v) => v.toLowerCase());
        return lower.includes(name) || vendors.some((v) => lower.includes(v));
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

    const bom = await runBomAgent(solutionWithSelection, {
      projectId: conversation.project_id,
      requirements: project.requirements_json
    });
    await persistBomJson(conversation.project_id, bom);

    await updateConversationStage(conversationId, "bom");

    await approveProject(conversation.project_id);

    const resolvedName = project.requirements_json?.customer_profile?.name || project.intake_json?.customer_name;
    const proposalIntake = { ...project.intake_json, customer_name: resolvedName || project.intake_json?.customer_name };
    await runProposalAgent(
      proposalIntake,
      project.requirements_json,
      solutionWithSelection,
      bom,
      { projectId: conversation.project_id }
    );

    await updateConversationStage(conversationId, "complete");

    const finalProject = await getProjectById(conversation.project_id);
    const responseText = formatBomAndProposal(bom, finalProject);
    await addMessage(conversationId, "assistant", responseText);

    return {
      conversation_id: conversationId,
      project_id: conversation.project_id,
      stage: "complete",
      text: responseText,
      created: false
    };
  });
}

export async function handleChatMessage({ conversationId, message, userId }) {
  if (!conversationId) {
    try {
      return await handleGreeting({ message, userId });
    } catch (error) {
      return {
        conversation_id: conversationId ?? null,
        project_id: null,
        stage: "greeting",
        text: `Sorry, an error occurred during discovery: ${error.message}. Please try again.`,
        created: false,
        ok: false
      };
    }
  }

  const conversation = await getConversationById(conversationId);
  if (!conversation) {
    return {
      conversation_id: conversationId,
      project_id: null,
      stage: "error",
      text: "Conversation not found. Please start a new conversation.",
      created: false,
      ok: false
    };
  }

  const stage = conversation.stage;

  if (stage === "complete") {
    return {
      conversation_id: conversationId,
      project_id: conversation.project_id,
      stage: "complete",
      text: "Proposal นี้สร้างเสร็จแล้วครับ หากต้องการปรับเปลี่ยนข้อกำหนด เช่น เปลี่ยน platform หรือ vendor กรุณาเริ่ม conversation ใหม่และระบุความต้องการทั้งหมดใหม่ตั้งแต่ต้นครับ",
      created: false
    };
  }

  if (stage === "discovery_questions") {
    try {
      return await handleDiscoveryQuestions({ conversation, conversationId, message, userId });
    } catch (error) {
      await addMessage(conversationId, "assistant", `Sorry, an error occurred during discovery: ${error.message}. Please try again.`).catch(() => {});
      return {
        conversation_id: conversationId,
        project_id: conversation.project_id,
        stage,
        text: `Sorry, an error occurred during discovery: ${error.message}. Please try again.`,
        created: false,
        ok: false
      };
    }
  }

  if (stage === "awaiting_selection") {
    try {
      return await handleAwaitingSelection({ conversation, conversationId, message });
    } catch (error) {
      await addMessage(conversationId, "assistant", `Sorry, an error occurred during selection: ${error.message}. Please try again.`).catch(() => {});
      return {
        conversation_id: conversationId,
        project_id: conversation.project_id,
        stage,
        text: `Sorry, an error occurred during selection: ${error.message}. Please try again.`,
        created: false,
        ok: false
      };
    }
  }

  return {
    conversation_id: conversationId,
    project_id: conversation.project_id,
    stage,
    text: `An error occurred: unexpected stage "${stage}". Please start a new conversation.`,
    created: false,
    ok: false
  };
}
