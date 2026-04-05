import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "../lib/config.js";
import { withAgentLogging } from "../lib/logging.js";
import { generateJsonWithOpenAI } from "../lib/openai.js";
import { validateBom } from "../lib/validation.js";
import { persistBomJson } from "../lib/projects.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
        notes: "3-node HCI cluster — confirm CPU/RAM/storage sizing with Nutanix sizing tool"
      });
    } else if (vendor === "Dell") {
      rows.push({
        category: "Server",
        description: "Dell PowerEdge R750, 2x Intel Xeon Gold 6330 (28-core), 512GB DDR4 ECC RAM, 8x 3.84TB SSD NVMe, dual 25GbE NIC, dual 800W PSU",
        qty: 3,
        notes: "Compute nodes for HCI or 3-tier cluster"
      });
    } else if (vendor === "HPE") {
      rows.push({
        category: "Server",
        description: "HPE ProLiant DL380 Gen10 Plus, 2x Intel Xeon Gold 6330, 512GB DDR4, 8x 3.84TB SSD, dual 25GbE NIC",
        qty: 3,
        notes: "Compute nodes"
      });
    }
  }

  for (const vendor of backupVendors) {
    if (vendor === "Veeam") {
      rows.push({
        category: "Backup Software",
        description: "Veeam Data Platform Foundation, Enterprise Plus edition, per-VM socket license",
        qty: 1,
        notes: "Covers up to 50 VMs — include Veeam ONE for monitoring"
      });
    }
  }

  for (const vendor of hypervisorVendors) {
    if (vendor === "Proxmox VE") {
      rows.push({
        category: "Hypervisor",
        description: "Proxmox VE Subscription, Basic or Standard tier, per node",
        qty: 3,
        notes: "Community edition is free; subscription required for enterprise support"
      });
    } else if (vendor === "VMware") {
      rows.push({
        category: "Hypervisor",
        description: "VMware vSphere Enterprise Plus license, per socket",
        qty: 6,
        notes: "2 sockets per server x 3 nodes"
      });
    }
  }

  if (rows.length === 0) {
    rows.push({
      category: "Solution Components",
      description: selected.architecture,
      qty: 1,
      notes: "Confirm detailed specs with vendor"
    });
  }

  return {
    rows,
    notes: [
      "Pricing to be requested from authorized distributor",
      "Final specifications subject to customer workshop validation",
      "Quantities are estimates — confirm with sizing tools before quoting"
    ]
  };
}

function sanitizeBomOutput(output) {
  const rows = (output.rows || []).map((row) => ({
    category: String(row.category ?? "").trim(),
    description: String(row.description ?? "").trim(),
    qty: Math.max(1, parseInt(row.qty ?? 1, 10)),
    notes: String(row.notes ?? "").trim()
  }));

  return {
    rows,
    notes: Array.isArray(output.notes) ? output.notes.filter(Boolean) : []
  };
}

export async function runBomAgent(solution, options = {}) {
  const prompt = await loadPrompt();
  const selected = solution.options[solution.selected_option ?? 0];
  const scale = options.requirements?.scale ?? {};

  const output = await withAgentLogging(
    {
      agentName: "bom",
      projectId: options.projectId,
      modelUsed: config.openai.models.bom,
      input: { selected_option: selected, scale }
    },
    () =>
      generateJsonWithOpenAI({
        systemPrompt: prompt,
        userPrompt: JSON.stringify({ selected_option: selected, scale, requirements: options.requirements }, null, 2),
        model: config.openai.models.bom,
        textFormat: bomTextFormat,
        mockResponseFactory: async () => buildMockBom(solution)
      })
  );

  const bomJson = sanitizeBomOutput(output);

  if (options.projectId) {
    await persistBomJson(options.projectId, bomJson);
  }

  return validateBom(bomJson);
}
