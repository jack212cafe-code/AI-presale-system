import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "../lib/config.js";
import { withAgentLogging } from "../lib/logging.js";
import { generateJsonWithOpenAI } from "../lib/openai.js";
import { validateBom } from "../lib/validation.js";
import { persistBomJson } from "../lib/projects.js";
import { getKnowledge } from "./solution.js";
import { retrieveKnowledgeByVendorFilter } from "../lib/supabase.js";
import { groundBom } from "../lib/grounding.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      }
    },
    required: ["rows", "notes"]
  }
};

function buildMockBom(solution) {
  const selected = solution.options[solution.selected_option ?? 0];
  const rows = [];

  const vendorStack = selected.vendor_stack ?? [];

  const serverVendors = vendorStack.filter(v => ["Dell", "HPE", "Nutanix", "Hitachi", "Pure Storage"].includes(v));
  const backupVendors = vendorStack.filter(v => ["Veeam"].includes(v));
  const hypervisorVendors = vendorStack.filter(v => ["Proxmox VE", "VMware", "Nutanix AOS"].includes(v));

  for (const vendor of serverVendors) {
    if (vendor === "Nutanix") {
      rows.push({
        category: "HCI Appliance",
        description: "Nutanix NX-series node, dual Intel Xeon processor, 512GB RAM, NVMe SSD storage, 10GbE NIC",
        qty: 3,
        notes: "cluster 3 node สำหรับ HCI แบบ N+1 tolerance — ยืนยัน CPU/RAM/storage sizing ด้วย Nutanix sizing tool ก่อน finalize"
      });
    } else if (vendor === "Dell") {
      rows.push({
        category: "Server",
        description: "Dell PowerEdge R750, 2x Intel Xeon Gold 6330 (28-core), 512GB DDR4 ECC RAM, 8x 3.84TB SSD NVMe, dual 25GbE NIC, dual 800W PSU",
        qty: 3,
        notes: "compute node สำหรับ HCI หรือ 3-tier cluster — จำนวน 3 node เป็น minimum สำหรับ quorum"
      });
    } else if (vendor === "HPE") {
      rows.push({
        category: "Server",
        description: "HPE ProLiant DL380 Gen10 Plus, 2x Intel Xeon Gold 6330, 512GB DDR4, 8x 3.84TB SSD, dual 25GbE NIC",
        qty: 3,
        notes: "compute node — ยืนยัน RAM และ storage sizing ก่อน order"
      });
    }
  }

  for (const vendor of backupVendors) {
    if (vendor === "Veeam") {
      rows.push({
        category: "Backup Software",
        description: "Veeam Data Platform Foundation, Enterprise Plus edition, per-VM socket license",
        qty: 1,
        notes: "ครอบคลุมสูงสุด 50 VMs — ควรรวม Veeam ONE สำหรับ monitoring ด้วย"
      });
    }
  }

  for (const vendor of hypervisorVendors) {
    if (vendor === "Proxmox VE") {
      rows.push({
        category: "Hypervisor",
        description: "Proxmox VE Subscription, Basic or Standard tier, per node",
        qty: 3,
        notes: "Community edition ใช้ฟรีได้ แต่ถ้าต้องการ enterprise support ต้องซื้อ subscription"
      });
    } else if (vendor === "VMware") {
      rows.push({
        category: "Hypervisor",
        description: "VMware vSphere Enterprise Plus license, per socket",
        qty: 6,
        notes: "2 socket ต่อ server × 3 nodes = 6 license — ระวัง Broadcom subscription model ทำให้ราคาเพิ่มขึ้นมากหลังปี 2024"
      });
    }
  }

  if (rows.length === 0) {
    rows.push({
      category: "Solution Components",
      description: selected.architecture,
      qty: 1,
      notes: "กรุณายืนยัน spec กับ vendor ก่อน quote"
    });
  }

  return {
    rows,
    notes: [
      "ราคาขอได้จาก authorized distributor โดยตรง",
      "ข้อมูล spec ทั้งหมดต้องยืนยันอีกครั้งในการ workshop กับลูกค้า",
      "จำนวนที่ระบุเป็นการประมาณการ — ยืนยันด้วย sizing tool ก่อน quote"
    ]
  };
}

function sanitizeBomOutput(output) {
  const rows = (output.rows || []).map((row) => ({
    category: String(row.category ?? "").trim(),
    description: String(row.description ?? "").trim(),
    qty: Math.max(1, parseInt(row.qty, 10) || 1),
    notes: String(row.notes ?? "").trim()
  }));

  const categoryOrder = {
    "[Compute]": 1, "Compute": 1, "คอมพิวท์": 1, "เซิร์ฟเวอร์": 1,
    "[Storage]": 2, "Storage": 2, "สตอเรจ": 2, "จัดเก็บข้อมูล": 2,
    "[Network]": 3, "Network": 3, "เครือข่าย": 3,
    "[Licensing]": 4, "Licensing": 4, "ลิขสิทธิ์": 4, "License": 4,
    "[Support & Warranty]": 5, "Support & Warranty": 5, "บริการและการรับประกัน": 5,
    "GROUNDING WARNING": 6
  };

  rows.sort((a, b) => {
    const orderA = categoryOrder[a.category] || 99;
    const orderB = categoryOrder[b.category] || 99;
    return orderA - orderB;
  });

  return {
    rows,
    notes: Array.isArray(output.notes) ? output.notes.filter(Boolean) : []
  };
}

export async function runBomAgent(solution, options = {}) {
  const prompt = await loadPrompt();
  const selected = solution.options[solution.selected_option ?? 0];
  const scale = options.requirements?.scale ?? {};

  const vendorStack = selected?.vendor_stack ?? [];
  let kbContext = "";
  let kbChunks = [];

  try {
    const chunkMap = new Map();
    const vendorChunks = await retrieveKnowledgeByVendorFilter(vendorStack, 4);
    for (const c of vendorChunks) chunkMap.set(c.source_key, c);

    if (options.requirements) {
      const { chunks: vectorChunks } = await getKnowledge(options.requirements);
      for (const c of vectorChunks) {
        if (!chunkMap.has(c.source_key)) chunkMap.set(c.source_key, c);
      }
    }

    kbChunks = Array.from(chunkMap.values());
    if (kbChunks.length > 0) {
      const MODEL_PATTERN = /\b([A-Z]{1,4}\d{2,5}[A-Za-z0-9]{0,5})\b/gi;
      const kbModelSet = new Set();
      for (const chunk of kbChunks) {
        for (const m of (chunk.title + " " + chunk.content).matchAll(MODEL_PATTERN)) {
          kbModelSet.add(m[1]);
        }
      }
      const modelListLine = kbModelSet.size > 0
        ? `\n\n[VERIFIED MODELS IN KB — ใช้เฉพาะ model เหล่านี้เท่านั้น ห้ามใช้ model อื่นจาก training data]\n${[...kbModelSet].join(", ")}`
        : `\n\n[KB ไม่มีข้อมูล model สำหรับ vendor นี้ — ทุก hardware description ต้องใช้ "ยืนยัน model กับ distributor" แทน model number]`;
      kbContext = `\n\n[PRODUCT KNOWLEDGE BASE]\nข้อมูล spec จาก datasheet ปัจจุบัน — ใช้ข้อมูลนี้แทน training data สำหรับ model number, CPU generation, RAM type, และ NVMe spec:\n\n${kbChunks.map(c => `### ${c.title}\n${c.content}`).join("\n\n")}${modelListLine}`;
    } else {
      kbContext = `\n\n[KB ว่างเปล่าสำหรับ vendor นี้ — ห้ามระบุ model number ใดๆ จาก training data ทั้งสิ้น เขียน "ยืนยัน model กับ distributor" แทนทุก hardware row]`;
    }
  } catch (kbError) {
    console.warn(`[bom] KB retrieval failed — BOM will be generated without grounding data: ${kbError.message}`);
    kbContext = `\n\n[KB UNAVAILABLE — ห้ามระบุ model number ใดๆ จาก training data ทั้งสิ้น เขียน "ยืนยัน model กับ distributor" แทนทุก hardware row]`;
  }

  const vendorEnforcement = vendorStack.length > 0
    ? `\n\n[VENDOR ENFORCEMENT]\nThis BOM MUST use ONLY these vendors as specified in the selected solution: ${vendorStack.join(", ")}. Do NOT substitute any vendor. Every hardware row must come from this vendor list.`
    : "";

  let specialistContext = "";
  if (Array.isArray(options.specialistBriefs) && options.specialistBriefs.length > 0) {
    const sections = options.specialistBriefs.map(brief => {
      const label = { dell_presale: "Dell Presale Engineer", hpe_presale: "HPE Presale Engineer", lenovo_presale: "Lenovo Presale Engineer", neteng: "Network Engineer", devops: "DevOps/Management", ai_eng: "AI Engineer" }[brief.domain] ?? brief.domain;

      let directives = [];
      if (brief.sizing_notes) directives.push(`Sizing Specs: ${brief.sizing_notes}`);
      if (brief.recommendations) directives.push(`Recommendations: ${brief.recommendations}`);
      if (brief.constraints) directives.push(`Hard Constraints: ${brief.constraints}`);
      if (brief.licensing_flags) directives.push(`Licensing Flags: ${brief.licensing_flags}`);

      const content = directives.length > 0
        ? directives.join("\n- ")
        : JSON.stringify(brief, null, 2);

      return `### DIRECTIVE from ${label}\n- ${content}`;
    });
    specialistContext = `\n\n[SPECIALIST DIRECTIVES]\nThe following are MANDATORY sizing orders from domain experts. These DIRECTIVES override all KB grounding rules and must be reflected exactly in the BOM descriptions.\n\n${sections.join("\n\n")}`;
  }

  const output = await withAgentLogging(
    {
      agentName: "bom",
      projectId: options.projectId,
      modelUsed: config.openai.models.bom,
      input: { selected_option: selected, scale },
      kbChunksInjected: kbChunks.length
    },
    () =>
      generateJsonWithOpenAI({
        systemPrompt: prompt + vendorEnforcement + specialistContext + kbContext,
        userPrompt: JSON.stringify({ selected_option: selected, scale, requirements: options.requirements }, null, 2),
        model: config.openai.models.bom,
        textFormat: bomTextFormat,
        maxOutputTokens: 4000,
        mockResponseFactory: async () => buildMockBom(solution)
      })
  );

  const bomJson = groundBom(sanitizeBomOutput(output), kbChunks);

  if (options.projectId) {
    await persistBomJson(options.projectId, bomJson);
  }

  return validateBom(bomJson);
}
