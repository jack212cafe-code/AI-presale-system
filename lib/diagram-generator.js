import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { generateJsonWithOpenAI } from "./openai.js";
import { config } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DIAGRAM_PROMPT = readFileSync(resolve(__dirname, "../agents/_prompts/diagram-generator.md"), "utf-8");

const DIAGRAM_TEXT_FORMAT = {
  name: "network_diagram",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      devices: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            type: { type: "string", enum: ["firewall", "switch", "server", "storage", "client", "backup", "cloud"] }
          },
          required: ["id", "label", "type"]
        }
      },
      connections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            from: { type: "string" },
            to: { type: "string" },
            label: { type: "string" }
          },
          required: ["from", "to", "label"]
        }
      }
    },
    required: ["devices", "connections"]
  }
};

const TYPE_STYLE = {
  firewall: "fill:#e74c3c,color:#fff,stroke:#c0392b",
  switch: "fill:#3498db,color:#fff,stroke:#2980b9",
  server: "fill:#2ecc71,color:#fff,stroke:#27ae60",
  storage: "fill:#9b59b6,color:#fff,stroke:#8e44ad",
  backup: "fill:#f39c12,color:#fff,stroke:#e67e22",
  client: "fill:#95a5a6,color:#fff,stroke:#7f8c8d",
  cloud: "fill:#1abc9c,color:#fff,stroke:#16a085"
};

function buildMermaidCode(devices, connections) {
  const lines = ["graph LR"];
  for (const d of devices) {
    const style = TYPE_STYLE[d.type] || TYPE_STYLE.server;
    lines.push(`    ${d.id}["${d.label}"]`);
    lines.push(`    style ${d.id} ${style}`);
  }
  for (const c of connections) {
    lines.push(`    ${c.from} -->|"${c.label}"| ${c.to}`);
  }
  return lines.join("\n");
}

export async function generateDiagramFromSolution({ solution, bom, requirements }) {
  const model = config.openai.models?.diagram || config.openai.models?.solution || "gpt-4o-mini";

  const bomRows = (bom?.rows || []).filter(r => r.category !== "GROUNDING WARNING");
  const selectedOption = solution?.options?.[solution.selected_option || 0];

  const userPrompt = JSON.stringify({
    solution_name: selectedOption?.name || "Selected Solution",
    solution_description: selectedOption?.description || "",
    bom_items: bomRows.map(r => ({ category: r.category, description: r.description, qty: r.qty })),
    user_count: requirements?.scale?.user_count,
    use_cases: requirements?.use_cases
  }, null, 2);

  const { output, mock } = await generateJsonWithOpenAI({
    systemPrompt: DIAGRAM_PROMPT,
    userPrompt,
    model,
    maxOutputTokens: 1500,
    textFormat: DIAGRAM_TEXT_FORMAT,
    mockResponseFactory: async () => ({
      devices: [
        { id: "FW1", label: "FortiGate Firewall", type: "firewall" },
        { id: "SW1", label: "Core Switch (25GbE)", type: "switch" },
        { id: "SW2", label: "Backup Switch (10GbE)", type: "switch" },
        { id: "SRV1", label: "PowerEdge R760xs x3", type: "server" },
        { id: "STOR", label: "PowerProtect DD6400", type: "backup" },
        { id: "WAN", label: "Internet/WAN", type: "cloud" },
        { id: "CLI", label: "Client Workstations", type: "client" }
      ],
      connections: [
        { from: "WAN", to: "FW1", label: "1GbE" },
        { from: "FW1", to: "SW1", label: "10GbE" },
        { from: "SW1", to: "SRV1", label: "25GbE" },
        { from: "SRV1", to: "SW2", label: "10GbE" },
        { from: "SW2", to: "STOR", label: "10GbE" },
        { from: "SW1", to: "CLI", label: "1GbE" }
      ]
    })
  });

  const mermaidCode = buildMermaidCode(output.devices, output.connections);
  return { mermaidCode, mock };
}