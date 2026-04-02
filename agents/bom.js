import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "../lib/config.js";
import { withAgentLogging } from "../lib/logging.js";
import { generateJsonWithOpenAI } from "../lib/openai.js";
import { getPricingRowsByVendors } from "../lib/supabase.js";
import { validateBom } from "../lib/validation.js";
import { persistBomJson } from "../lib/projects.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fallbackCatalog = [
  { vendor: "Nutanix", part_number: "NX-HCI-BASE", description: "Nutanix HCI base node", unit_price: 420000 },
  { vendor: "Veeam", part_number: "VEEAM-ENT", description: "Veeam Enterprise license", unit_price: 180000 },
  { vendor: "Dell", part_number: "DELL-3TIER", description: "Dell compute/storage bundle", unit_price: 510000 }
];

async function loadPrompt() {
  return readFile(path.join(__dirname, "_prompts", "bom.md"), "utf8");
}

const bomTextFormat = {
  type: "json_schema",
  name: "bom_rows",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      currency: { type: "string" },
      rows: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            part_number: { type: "string" },
            description: { type: "string" },
            qty: { type: ["number", "integer"] },
            unit_price: { type: ["number", "integer"] },
            total_price: { type: ["number", "integer"] }
          },
          required: ["part_number", "description", "qty", "unit_price", "total_price"]
        }
      },
      subtotal: { type: ["number", "integer"] },
      notes: {
        type: "array",
        items: { type: "string" }
      }
    },
    required: ["currency", "rows", "subtotal", "notes"]
  }
};

const HARDWARE_VENDORS = new Set(["Nutanix", "Dell", "HPE", "Hitachi", "Pure Storage"]);
const DEFAULT_NODE_COUNT = 3;

function deriveQty(vendor, scale) {
  if (HARDWARE_VENDORS.has(vendor)) {
    const nodeCount = scale?.node_count ?? scale?.nodes ?? 0;
    return nodeCount > 0 ? nodeCount : DEFAULT_NODE_COUNT;
  }
  return 1;
}

function buildMockBom(solution, pricingRows, scale) {
  const selected = solution.options[solution.selected_option ?? 0];
  const rows = selected.vendor_stack.map((vendor) => {
    const item =
      pricingRows.find((row) => row.vendor === vendor) ||
      fallbackCatalog.find((row) => row.vendor === vendor) ||
      { part_number: `${vendor.toUpperCase()}-GEN`, description: `${vendor} generic item`, unit_price: 100000 };

    const qty = deriveQty(vendor, scale);
    const total_price = qty * Number(item.unit_price);

    return {
      part_number: item.part_number,
      description: item.description,
      qty,
      unit_price: Number(item.unit_price),
      total_price
    };
  });

  return {
    currency: "THB",
    rows,
    subtotal: rows.reduce((total, row) => total + row.total_price, 0),
    notes: pricingRows.length === 0 ? ["Using fallback price assumptions."] : []
  };
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== null && item !== undefined && String(item).trim() !== "");
  }

  if (value === null || value === undefined || value === "") {
    return [];
  }

  return [String(value).trim()];
}

function sanitizeBomOutput(output) {
  const rows = (output.rows || []).map((row) => ({
    part_number: String(row.part_number ?? "").trim(),
    description: String(row.description ?? "").trim(),
    qty: Number(row.qty ?? 0),
    unit_price: Number(row.unit_price ?? 0),
    total_price: Number(row.total_price ?? 0)
  }));

  return {
    currency: output.currency || "THB",
    rows,
    subtotal: Number(output.subtotal ?? rows.reduce((sum, row) => sum + row.total_price, 0)),
    notes: toArray(output.notes)
  };
}

export async function runBomAgent(solution, options = {}) {
  const prompt = await loadPrompt();
  const selected = solution.options[solution.selected_option ?? 0];
  const pricingRows = await getPricingRowsByVendors(selected.vendor_stack);
  const scale = options.requirements?.scale ?? {};

  const output = await withAgentLogging(
    {
      agentName: "bom",
      projectId: options.projectId,
      modelUsed: config.openai.models.bom,
      input: {
        selected_option: selected,
        pricing_rows: pricingRows,
        scale
      }
    },
    () =>
      generateJsonWithOpenAI({
        systemPrompt: prompt,
        userPrompt: JSON.stringify(
          {
            selected_option: selected,
            pricing_rows: pricingRows,
            scale
          },
          null,
          2
        ),
        model: config.openai.models.bom,
        textFormat: bomTextFormat,
        mockResponseFactory: async () => buildMockBom(solution, pricingRows, scale)
      })
  );

  const bomJson = sanitizeBomOutput(output);

  if (options.projectId) {
    await persistBomJson(options.projectId, bomJson);
  }

  return validateBom(bomJson);
}
