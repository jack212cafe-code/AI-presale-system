import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "../lib/config.js";
import { withAgentLogging } from "../lib/logger.js";
import { generateJsonWithOpenAI } from "../lib/openai.js";
import { getKnowledge } from "./solution.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Schemas ────────────────────────────────────────────────────────────────

const torParserSchema = {
  type: "json_schema",
  name: "tor_parsed",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      project_name: { type: "string" },
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            item_no: { type: "string" },
            category: { type: "string" },
            quantity: { type: "number" },
            unit: { type: "string" },
            raw_spec_text: { type: "string" },
            specs: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  label: { type: "string" },
                  operator: { type: "string" },
                  value: { type: "string" },
                  unit: { type: "string" },
                  original_text: { type: "string" }
                },
                required: ["label", "operator", "value", "unit", "original_text"]
              }
            }
          },
          required: ["item_no", "category", "quantity", "unit", "raw_spec_text", "specs"]
        }
      }
    },
    required: ["project_name", "items"]
  }
};

const torComplianceSchema = {
  type: "json_schema",
  name: "tor_compliance_item",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      item_no: { type: "string" },
      category: { type: "string" },
      quantity: { type: "number" },
      recommended_model: { type: "string" },
      model_spec_summary: { type: "string" },
      compliance_checks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            spec_label: { type: "string" },
            tor_requirement: { type: "string" },
            product_value: { type: "string" },
            status: { type: "string" },
            note: { type: "string" }
          },
          required: ["spec_label", "tor_requirement", "product_value", "status", "note"]
        }
      },
      overall_status: { type: "string" },
      compliance_statement_th: { type: "string" },
      presale_review_notes: { type: "array", items: { type: "string" } },
      kb_coverage: { type: "string" }
    },
    required: ["item_no", "category", "quantity", "recommended_model", "model_spec_summary",
               "compliance_checks", "overall_status", "compliance_statement_th",
               "presale_review_notes", "kb_coverage"]
  }
};

// ── TOR Parser Agent ────────────────────────────────────────────────────────

export async function runTorParserAgent(torText, options = {}) {
  const prompt = await readFile(path.join(__dirname, "_prompts", "tor_parser.md"), "utf8");

  return withAgentLogging(
    { agentName: "tor_parser", projectId: options.projectId, modelUsed: config.openai.models.specialist, input: { text_length: torText.length } },
    () => generateJsonWithOpenAI({
      systemPrompt: prompt,
      userPrompt: torText,
      model: config.openai.models.specialist,
      textFormat: torParserSchema,
      maxOutputTokens: 3000,
      mockResponseFactory: async () => ({
        project_name: "โครงการจัดหาครุภัณฑ์ (Mock)",
        items: [{
          item_no: "1",
          category: "เครื่องแม่ข่าย (Server)",
          quantity: 2,
          unit: "เครื่อง",
          raw_spec_text: torText.slice(0, 200),
          specs: [
            { label: "ความเร็วซีพียู", operator: ">=", value: "2.5", unit: "GHz", original_text: "ความเร็วไม่น้อยกว่า 2.5 GHz" },
            { label: "หน่วยความจำ", operator: ">=", value: "64", unit: "GB", original_text: "หน่วยความจำไม่น้อยกว่า 64 GB" }
          ]
        }]
      })
    })
  );
}

// ── TOR Compliance Agent (per item) ─────────────────────────────────────────

async function runTorComplianceItemAgent(item, options = {}) {
  const prompt = await readFile(path.join(__dirname, "_prompts", "tor_compliance.md"), "utf8");

  // Retrieve KB knowledge relevant to this item's category
  const query = buildKbQuery(item.category, item.specs);
  let kbContext = "";
  try {
    const { chunks } = await getKnowledge({ use_cases: [query], _kb_hint: query });
    if (chunks.length > 0) {
      kbContext = `\n\n[KNOWLEDGE BASE — Product Datasheets]\nUse these spec sheets to find compliant products. Only recommend models that appear here.\n\n${chunks.map(c => `### ${c.title}\n${c.content}`).join("\n\n")}`;
    }
  } catch { /* KB unavailable — agent will return kb_coverage: not_found */ }

  const userPrompt = JSON.stringify(item, null, 2);

  return withAgentLogging(
    { agentName: "tor_compliance", projectId: options.projectId, modelUsed: config.openai.models.specialist, input: { item_no: item.item_no, category: item.category } },
    () => generateJsonWithOpenAI({
      systemPrompt: prompt + kbContext,
      userPrompt,
      model: config.openai.models.specialist,
      textFormat: torComplianceSchema,
      maxOutputTokens: 2000,
      mockResponseFactory: async () => ({
        item_no: item.item_no,
        category: item.category,
        quantity: item.quantity,
        recommended_model: "Dell PowerEdge R360 (Mock)",
        model_spec_summary: "Intel Xeon E-2434 3.4GHz 4C/8T, 64GB DDR5, 1.92TB NVMe",
        compliance_checks: item.specs.map(s => ({
          spec_label: s.label,
          tor_requirement: `${s.operator} ${s.value} ${s.unit}`,
          product_value: `${s.value} ${s.unit} (mock)`,
          status: "review",
          note: "Mock mode — กรุณาเพิ่ม datasheet ใน KB"
        })),
        overall_status: "comply_with_review",
        compliance_statement_th: `${item.category} comply (Mock) — กรุณาเพิ่ม datasheet จริงใน KB`,
        presale_review_notes: ["Mock mode: ตรวจสอบ KB coverage"],
        kb_coverage: "not_found"
      })
    })
  );
}

function buildKbQuery(category, specs) {
  const cat = category.toLowerCase();
  const specLabels = specs.map(s => s.label).join(" ");
  if (/server|แม่ข่าย/.test(cat)) return `server rack CPU cores RAM storage NVMe datasheet specifications ${specLabels}`;
  if (/switch|สวิตช์/.test(cat)) return `network switch port GbE layer datasheet specifications ${specLabels}`;
  if (/storage|san|nas|จัดเก็บ/.test(cat)) return `storage SAN NAS RAID capacity IOPS datasheet ${specLabels}`;
  if (/firewall|ไฟร์วอลล์|security/.test(cat)) return `firewall throughput VPN SSL inspection datasheet ${specLabels}`;
  if (/ups|ไฟสำรอง/.test(cat)) return `UPS power backup kVA battery runtime datasheet ${specLabels}`;
  if (/pc|computer|คอมพิวเตอร์/.test(cat)) return `desktop PC workstation CPU RAM storage datasheet ${specLabels}`;
  return `IT equipment datasheet specifications ${category} ${specLabels}`;
}

// ── Main TOR Pipeline ────────────────────────────────────────────────────────

export async function runTorPipeline(torText, options = {}) {
  const { onProgress } = options;

  onProgress?.(1, 3, "กำลังวิเคราะห์ TOR spec...");
  const parsed = await runTorParserAgent(torText, options);

  if (!parsed?.items?.length) {
    throw new Error("ไม่พบรายการ spec ใน TOR — กรุณาตรวจสอบรูปแบบข้อความ");
  }

  onProgress?.(2, 3, `กำลังตรวจสอบ compliance ${parsed.items.length} รายการ...`);
  const complianceResults = await Promise.allSettled(
    parsed.items.map(item => runTorComplianceItemAgent(item, options))
  );

  const items = complianceResults.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    console.warn(`[tor_compliance] item ${parsed.items[i].item_no} failed: ${r.reason?.message}`);
    return {
      item_no: parsed.items[i].item_no,
      category: parsed.items[i].category,
      quantity: parsed.items[i].quantity,
      recommended_model: "— ไม่สามารถประมวลผลได้ —",
      model_spec_summary: "",
      compliance_checks: [],
      overall_status: "kb_insufficient",
      compliance_statement_th: "เกิดข้อผิดพลาดระหว่างการตรวจสอบ — กรุณาตรวจสอบด้วยตนเอง",
      presale_review_notes: [`Error: ${r.reason?.message}`],
      kb_coverage: "not_found"
    };
  });

  onProgress?.(3, 3, "กำลังสรุปผล...");

  return {
    project_name: parsed.project_name,
    tor_id: `tor_${Date.now()}`,
    items
  };
}
