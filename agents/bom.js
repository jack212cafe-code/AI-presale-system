import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "../lib/config.js";
import { withAgentLogging } from "../lib/logger.js";
import { generateJsonWithOpenAI } from "../lib/openai.js";
import { validateBom } from "../lib/validation.js";
import { groundBom } from "../lib/grounding.js";
import { retrieveKnowledgeByVendorFilter } from "../lib/supabase.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOM_MAX_TOKENS = 1200;
const BOM_CALL_TIMEOUT_MS = 25_000;
const KB_TIMEOUT_MS = 20_000;
const KB_CHARS_LIMIT = 3500;
const REQUIRED_SECTION_CATEGORIES = ["[Compute]", "[Storage]", "[Network]", "[Licensing]", "[Support & Warranty]"];

function extractVerifiedModels(chunks) {
  const models = new Set();
  const pattern = /\b([A-Z]{1,4}\d{2,5}[A-Za-z0-9]{0,5})\b/gi;
  for (const chunk of chunks) {
    const text = `${chunk?.title ?? ""} ${chunk?.content ?? ""}`;
    for (const match of text.matchAll(pattern)) {
      models.add(match[1].toUpperCase());
    }
  }
  return Array.from(models).slice(0, 40);
}

function buildVendorKbContext(chunks) {
  if (!chunks.length) return "";

  let kbText = chunks
    .map((chunk) => `### ${chunk.title}\n${chunk.content}`)
    .join("\n\n");

  if (kbText.length > KB_CHARS_LIMIT) {
    kbText = kbText.slice(0, KB_CHARS_LIMIT) + "\n...[truncated]";
  }

  const verifiedModels = extractVerifiedModels(chunks);
  const verifiedLine = verifiedModels.length > 0
    ? `\n\n[VERIFIED MODELS]\n${verifiedModels.join(", ")}`
    : "\n\n[VERIFIED MODELS]\nNo explicit model number was found in KB. Use generic product families and require distributor verification for the exact SKU.";

  return `\n\n[PRODUCT KNOWLEDGE BASE]\nUse ONLY the products and specs found below. Do not invent model numbers, capacity tiers, or obsolete generations.\n\n${kbText}${verifiedLine}`;
}

async function callBomWithTimeout({ systemPrompt, userPrompt, model, textFormat }) {
  const result = await generateJsonWithOpenAI({
    systemPrompt,
    userPrompt,
    model,
    textFormat,
    maxOutputTokens: BOM_MAX_TOKENS,
    timeoutMs: BOM_CALL_TIMEOUT_MS
  });

  if (!Array.isArray(result.output?.rows) || result.output.rows.length === 0) {
    throw new Error("BOM returned empty rows");
  }

  return result;
}

async function loadPrompt() {
  const promptPath = path.join(__dirname, "_prompts", "bom.md");
  try {
    return await readFile(promptPath, "utf8");
  } catch (err) {
    throw new Error(`BOM prompt file not found at ${promptPath}: ${err.message}`);
  }
}

const bomTextFormat = {
  type: "json_schema",
  name: "bom_rows",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      rows: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            category: { type: "string" },
            description: { type: "string" },
            qty: { type: "integer" },
            notes: { type: "string" }
          },
          required: ["category", "description", "qty", "notes"]
        }
      },
      notes: {
        type: "array",
        items: { type: "string" }
      },
      thai_explanations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            row_index: { type: "integer" },
            explanation: { type: "string" }
          },
          required: ["row_index", "explanation"]
        }
      }
    },
    required: ["rows", "notes", "thai_explanations"]
  }
};

function sanitizeBomOutput(output) {
  const rows = (output.rows || []).map((row) => ({
    category: String(row.category ?? "").trim(),
    description: String(row.description ?? "").trim(),
    qty: Math.max(1, parseInt(row.qty, 10) || 1),
    notes: String(row.notes ?? "").trim()
  }));

  const categoryOrder = {
    "[Compute]": 1,
    Compute: 1,
    "[Storage]": 2,
    Storage: 2,
    "[Network]": 3,
    Network: 3,
    "[Licensing]": 4,
    Licensing: 4,
    License: 4,
    "[Support & Warranty]": 5,
    "Support & Warranty": 5,
    "GROUNDING WARNING": 6
  };

  rows.sort((a, b) => (categoryOrder[a.category] || 99) - (categoryOrder[b.category] || 99));

  return {
    rows,
    notes: Array.isArray(output.notes) ? output.notes.filter(Boolean) : []
  };
}

function cleanBomText(value) {
  return String(value ?? "")
    .replace(/\[(.*?) from KB\]/gi, (_, subject) => `ต้องยืนยัน ${String(subject).toLowerCase()} กับ distributor`)
    .replace(/\[(.*?)\]/g, "")
    .replace(/\bfrom KB\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBomRows(bomJson) {
  const rows = Array.isArray(bomJson.rows) ? bomJson.rows : [];
  const grouped = new Map(REQUIRED_SECTION_CATEGORIES.map((section) => [section, []]));
  const extras = [];

  for (const row of rows) {
    const rawCategory = String(row.category ?? "").trim();
    const description = cleanBomText(row.description);
    const notes = cleanBomText(row.notes);
    const normalizedRow = {
      category: rawCategory || "[Other]",
      description: description || "ต้องยืนยัน model กับ distributor",
      qty: Math.max(1, Number.isInteger(row.qty) ? row.qty : 1),
      notes
    };

    const matchedSection = REQUIRED_SECTION_CATEGORIES.find(
      (section) => rawCategory === section ||
        rawCategory.replace(/[\[\]]/g, "").trim().toLowerCase() === section.replace(/[\[\]]/g, "").trim().toLowerCase()
    );
    if (matchedSection) {
      grouped.get(matchedSection).push(normalizedRow);
    } else {
      extras.push(normalizedRow);
    }
  }

  const fallbackDescriptions = {
    "[Compute]": "Compute node ต้องยืนยัน current-generation model กับ distributor",
    "[Storage]": "Primary storage family ต้องยืนยัน exact model กับ distributor",
    "[Network]": "10/25GbE switching ต้องยืนยัน model กับ distributor",
    "[Licensing]": "Microsoft / Veeam licensing ตาม requirement ของโครงการ",
    "[Support & Warranty]": "3-5 year support and warranty package"
  };

  const orderedRows = REQUIRED_SECTION_CATEGORIES.flatMap((section) => {
    const existing = grouped.get(section) ?? [];
    if (existing.length > 0) return existing;
    return [{
      category: section,
      description: fallbackDescriptions[section],
      qty: 1,
      notes: "AI output did not provide a fully grounded row; verify with distributor"
    }];
  });

  return {
    rows: [...orderedRows, ...extras],
    notes: Array.isArray(bomJson.notes) ? bomJson.notes.map(cleanBomText).filter(Boolean) : []
  };
}

export async function runBomAgent(solution, options = {}) {
  const _t = Date.now();
  const prompt = await loadPrompt();
  const selected = solution.options[solution.selected_option ?? 0];
  const scale = options.requirements?.scale ?? {};
  const vendorStack = selected?.vendor_stack ?? [];
  const kbFetch = async () => {
    if (!vendorStack.length) return [];
    return Promise.race([
      retrieveKnowledgeByVendorFilter(vendorStack, 8),
      new Promise((_, reject) => setTimeout(() => reject(new Error("BOM KB retrieval timeout")), KB_TIMEOUT_MS))
    ]);
  };

  console.log(`[bom] kb-fetch started vendors=${vendorStack.join(",")}`);
  const kbChunks = await kbFetch().catch((error) => {
    console.warn(`[bom] +${Date.now()-_t}ms kb-fetch failed: ${error.message}`);
    throw new Error(`BOM KB retrieval failed: ${error.message}`);
  });
  console.log(`[bom] +${Date.now()-_t}ms kb-fetch done chunks=${kbChunks.length}`);
  const kbContext = buildVendorKbContext(kbChunks);

  const vendorEnforcement = vendorStack.length > 0
    ? `\n\n[VENDOR ENFORCEMENT]\nThis BOM MUST use ONLY these vendors as specified in the selected solution: ${vendorStack.join(", ")}. Do NOT substitute any vendor. Every hardware row must come from this vendor list.`
    : "";

  const dislikedVendors = options.requirements?.vendor_preferences?.disliked ?? [];
  const dislikedEnforcement = dislikedVendors.length > 0
    ? `\n\n[EXCLUDED VENDORS]\nThe customer explicitly rejected these vendors — do NOT include them in any row of this BOM: ${dislikedVendors.join(", ")}. If a row would require a product from these vendors (e.g. VMware licenses for VMware hypervisors), omit it and note that an alternative must be sourced.`
    : "";

  let specialistContext = "";
  if (Array.isArray(options.specialistBriefs) && options.specialistBriefs.length > 0) {
    const sections = options.specialistBriefs.map((brief) => {
      const label = {
        dell_presale: "Dell Presale Engineer",
        hpe_presale: "HPE Presale Engineer",
        lenovo_presale: "Lenovo Presale Engineer",
        neteng: "Network Engineer",
        devops: "DevOps/Management",
        ai_eng: "AI Engineer"
      }[brief.domain] ?? brief.domain;

      const directives = [];
      if (brief.sizing_notes) directives.push(`Sizing Specs: ${brief.sizing_notes}`);
      if (brief.recommendations) directives.push(`Recommendations: ${brief.recommendations}`);
      if (brief.constraints) directives.push(`Hard Constraints: ${brief.constraints}`);
      if (brief.licensing_flags) directives.push(`Licensing Flags: ${brief.licensing_flags}`);

      if (brief.technical_specs) {
        const ts = brief.technical_specs;
        const specs = [];
        if (ts.compute?.ram_gb) {
          specs.push(`Compute/node: ${ts.compute.ram_gb}GB RAM, ${ts.compute.sockets}×${ts.compute.cores_per_socket}C CPU (${ts.compute.cpu_cores} cores total)`);
        }
        if (Array.isArray(ts.storage) && ts.storage.length > 0) {
          const drives = ts.storage
            .filter(s => s.count > 0 && s.capacity_tb > 0)
            .map(s => `${s.count}× ${s.capacity_tb}TB ${s.type} (${s.model})`)
            .join(", ");
          if (drives) specs.push(`Storage/node: ${drives}`);
        }
        if (Array.isArray(ts.licenses) && ts.licenses.length > 0) {
          const lics = ts.licenses.map(l => `${l.name} × ${l.quantity} ${l.unit}${l.correction ? ` (${l.correction})` : ""}`).join(", ");
          specs.push(`Licenses: ${lics}`);
        }
        if (specs.length > 0) {
          directives.push(`HARDWARE SPECS (MUST include verbatim in BOM rows): ${specs.join(" | ")}`);
        }
      }

      const content = directives.length > 0 ? directives.join("\n- ") : JSON.stringify(brief, null, 2);
      return `### DIRECTIVE from ${label}\n- ${content}`;
    });

    specialistContext = `\n\n[SPECIALIST DIRECTIVES]\nThe following are mandatory sizing orders from domain experts. Apply them exactly in the BOM descriptions.\n\n${sections.join("\n\n")}`;
  }

  const bomRules = [
    "Use only the current solution, specialist directives, and the verified KB products below.",
    "Use the model numbers in selected_option as authoritative — do NOT override them. KB is for confirming specs and pricing only.",
    "Do not reference prior chats, prior projects, or previous customer names.",
    "Return a practical BOM with concise rows, quantities, and notes.",
    "If a model number is uncertain, say it must be verified with the distributor instead of inventing one.",
    "Never emit bracket placeholders like [Disk from KB] or [NIC from KB].",
    "For HCI use cases (S2D, VxRail, Proxmox, or any HCI cluster): minimum 3 compute nodes are required for quorum and redundancy. Never output Qty < 3 for HCI cluster compute nodes.",
    "HCI node count policy: use exactly 3 nodes unless VM count > 100 OR the requirement explicitly states mission-critical / tier-1 HA. Do NOT output 4+ nodes without justification written in the notes.",
    "Windows Server licensing is per physical core (min 16 cores/socket × 2 sockets = 32 cores/server). In Licensing rows, state cores explicitly (e.g., 'Windows Server 2022 Datacenter — 32 cores/server × N servers = X cores total'). NEVER express WS licensing as 'sockets', 'socket packs', or '8 sockets across N nodes'.",
    "Windows Server Edition rule: Use 'Windows Server 2022 Datacenter' for Nutanix AHV (ThinkAgile HX), VMware vSphere, Proxmox, and ANY non-Azure-Stack hypervisor. Use 'Windows Server 2022 Datacenter: Azure Edition' ONLY when the HCI platform is Azure Stack HCI (ThinkAgile MX, Dell AX for Azure Stack HCI, or HPE ProLiant for Azure Stack HCI). Mis-pairing Azure Edition with Nutanix AHV or VMware is a licensing error.",
    "Veeam licensing model: For VM-based backup, use per-VM (Veeam Universal License — VUL) or per-socket. Do NOT use capacity-based (per-TB) licensing for general VM backup. State license type AND quantity explicitly (e.g., '50 VUL instances' or 'Per-socket × 6 sockets'). Capacity-based licensing is ONLY valid for Veeam Backup for Microsoft 365 per-user, or object storage archive tiers.",
    "Backup infrastructure requirement: If the selected solution includes Veeam, Commvault, or any backup platform, the BOM MUST include BOTH: (a) a backup server — a dedicated Windows Server (min 8 cores, 32GB RAM, 500GB boot SSD) OR an explicit note 'backup server runs as VM on HCI cluster — sized 8vCPU/32GB/500GB'; AND (b) a backup storage target — Data Domain / DE-series / StoreOnce / ThinkSystem DM / NAS appliance. Do NOT rely on production HCI storage as backup repository.",
    "RAM sizing per node must use standard DIMM configurations: 128 / 192 / 256 / 384 / 512 / 768 / 1024 GB. Formula: ceil(vm_count × 8GB avg × 1.2 overhead ÷ node_count) rounded UP to the next standard size. Never output non-standard values like 160GB or 200GB.",
    "HCI compute row MUST list data drives separate from boot drive. Required format example: 'SR650 V3: 2× Intel Xeon Gold 6448Y (32C each), 512GB RAM, 2× 480GB SATA SSD (OS/boot RAID1), 6× 3.84TB NVMe (data tier), 2× 25GbE NIC'. For HCI (topology=HCI, Nutanix AHV / vSAN / Azure Stack HCI), emitting a compute row with only a boot drive is a critical architectural error — the cluster has no data capacity.",
    "Topology honesty: If selected_option.topology is 'HCI', the [Storage] section MUST NOT contain external shared storage (PowerStore, PowerVault, Lenovo DE-series, Lenovo DM-series, Unity, MSA, ME5, Alletra, Nimble). External storage rows belong only in 3-Tier topology, or as a separate backup repository.",
    "Windows Server Edition by hypervisor: selected_option.hypervisor='Nutanix AHV' → Windows Server 2022 Datacenter (standard). hypervisor='Azure Stack HCI' → Windows Server 2022 Datacenter: Azure Edition. hypervisor='VMware vSphere'/'Proxmox VE' → Windows Server 2022 Datacenter (standard). Never emit Azure Edition when hypervisor is Nutanix AHV.",
    "Switch upgrade vs new: If requirements.existing_infrastructure.switches contains '10G' or '25G' and the solution needs switching, emit a row annotated 'upgrade/replace existing 10G switches (customer has X switches)' rather than adding new switches without context. If the existing switches already meet the requirement (e.g., existing 25G + solution needs 25G), OMIT the switch row entirely and add a note 'existing 25G switches sufficient — no new switch required'."
  ].join("\n- ");

  const model = config.openai.models.bom;
  const userPrompt = JSON.stringify({ selected_option: selected, scale, requirements: options.requirements }, null, 2);

  console.log(`[bom] +${Date.now()-_t}ms attempt-1 started`);
  let output;
  try {
    output = await withAgentLogging(
      { agentName: "bom", projectId: options.projectId, modelUsed: model, input: { selected_option: selected, scale }, kbChunksInjected: kbChunks.length },
      () => callBomWithTimeout({
        systemPrompt: `${prompt}\n\n[BOM RULES]\n- ${bomRules}${vendorEnforcement}${dislikedEnforcement}${specialistContext}${kbContext}`,
        userPrompt,
        model,
        textFormat: bomTextFormat
      })
    );
    console.log(`[bom] +${Date.now()-_t}ms attempt-1 done rows=${output?.rows?.length}`);
  } catch (err1) {
    console.warn(`[bom] +${Date.now()-_t}ms attempt-1 failed (${err1.message}) — retrying`);
    options.onProgress?.(1, 4, "กำลังสร้าง BOM (retry)...");
    console.log(`[bom] +${Date.now()-_t}ms attempt-2 started`);
    output = await withAgentLogging(
      { agentName: "bom", projectId: options.projectId, modelUsed: model, input: { selected_option: selected, scale }, kbChunksInjected: kbChunks.length },
      () => callBomWithTimeout({
        systemPrompt: `${prompt}\n\n[RECOVERY]\nThe previous attempt failed validation or timed out.\n- Return valid JSON only.\n- Include at least 5 rows.\n- Keep descriptions short and specific.\n- Do not mention prior chats or old projects.\n- Never emit bracket placeholders like [Disk from KB] or [NIC from KB].${vendorEnforcement}${specialistContext}${kbContext}`,
        userPrompt,
        model,
        textFormat: bomTextFormat
      })
    );
    console.log(`[bom] +${Date.now()-_t}ms attempt-2 done rows=${output?.rows?.length}`);
  }

  const repaired = normalizeBomRows(groundBom(sanitizeBomOutput(output), kbChunks));
  return validateBom(repaired);
}
