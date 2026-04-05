import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "../lib/config.js";
import { withAgentLogging } from "../lib/logging.js";
import { generateJsonWithOpenAI } from "../lib/openai.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const specialistTextFormat = {
  type: "json_schema",
  name: "specialist_brief",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      domain: { type: "string" },
      analysis: { type: "string" },
      constraints: { type: "array", items: { type: "string" } },
      sizing_notes: { type: "array", items: { type: "string" } },
      recommendations: { type: "array", items: { type: "string" } },
      licensing_flags: { type: "array", items: { type: "string" } },
      risks: { type: "array", items: { type: "string" } }
    },
    required: ["domain", "analysis", "constraints", "sizing_notes", "recommendations", "licensing_flags", "risks"]
  }
};

const MOCK_BRIEFS = {
  syseng: (requirements) => ({
    domain: "syseng",
    analysis: "3-node HCI cluster sufficient for stated VM count. Standard compute sizing applied.",
    constraints: ["Minimum 3 nodes required for HCI N+1 tolerance"],
    sizing_notes: [
      `VM count: ${requirements.scale?.vm_count ?? 50}. RAM/node: ${Math.ceil((requirements.scale?.vm_count ?? 50) * 8 * 1.2 / 3 / 128) * 128}GB`,
      "Storage: raw = usable × 2 (RF2) ÷ 3 nodes"
    ],
    recommendations: ["Nutanix NX-3155G or Dell PowerEdge R760xs for this scale"],
    licensing_flags: ["VMware: Broadcom subscription only since 2024, ~3x cost increase"],
    risks: ["Confirm VM average RAM before finalizing node spec"]
  }),
  neteng: (requirements) => ({
    domain: "neteng",
    analysis: "Dual 25GbE NICs per node required for HCI storage traffic.",
    constraints: ["Minimum 25GbE per node for Nutanix/Ceph storage traffic"],
    sizing_notes: ["3 nodes × 2 ports = 6 × 25GbE ports minimum on switch"],
    recommendations: ["Cisco Catalyst 9300-48UXM or Aruba 6300M for top-of-rack"],
    licensing_flags: [],
    risks: ["Verify existing switch supports jumbo frames (MTU 9000) for storage traffic"]
  }),
  devops: (requirements) => ({
    domain: "devops",
    analysis: "Daily backup sufficient for most workloads. Backup repository sized at 2x protected data.",
    constraints: ["Backup repository must be separate from production storage"],
    sizing_notes: [
      `Backup repo: ${Math.ceil((requirements.scale?.storage_tb ?? 10) * 2 * 1.3)}TB estimated`
    ],
    recommendations: ["Veeam Data Platform Advanced — includes Veeam ONE monitoring"],
    licensing_flags: ["Per-VM license vs per-socket: calculate at final VM count"],
    risks: ["No monitoring stack specified — add Veeam ONE or Prometheus/Grafana"]
  }),
  ai_eng: (requirements) => ({
    domain: "ai_eng",
    analysis: "AI workload detected. Inference-only recommended as starting point.",
    constraints: ["GPU memory must match largest model to be served"],
    sizing_notes: ["7B-13B inference: 1x A100 40GB minimum"],
    recommendations: ["Dell PowerEdge R760xa with 1-2x NVIDIA A100 40GB for inference"],
    licensing_flags: ["NVIDIA GPU supply chain: 3-6 month lead time for H100 in Thailand"],
    risks: ["Distinguish inference vs training requirement before sizing — major cost difference"]
  })
};

function isAiWorkload(requirements) {
  const text = JSON.stringify(requirements).toLowerCase();
  return ["ai", " ml ", "machine learning", "gpu", "inference", "training", "llm", "generative", "data science"]
    .some(kw => text.includes(kw));
}

export function getActiveSpecialists(requirements) {
  const specialists = ["syseng", "neteng", "devops"];
  if (isAiWorkload(requirements)) {
    specialists.push("ai_eng");
  }
  return specialists;
}

export async function runSpecialistAgent(domain, requirements, options = {}) {
  const promptPath = path.join(__dirname, "_prompts", `${domain}.md`);
  const prompt = await readFile(promptPath, "utf8");

  const output = await withAgentLogging(
    {
      agentName: `specialist_${domain}`,
      projectId: options.projectId,
      modelUsed: config.openai.models.solution,
      input: { domain, scale: requirements.scale, use_cases: requirements.use_cases }
    },
    () =>
      generateJsonWithOpenAI({
        systemPrompt: prompt,
        userPrompt: JSON.stringify(requirements, null, 2),
        model: config.openai.models.solution,
        textFormat: specialistTextFormat,
        maxOutputTokens: 2000,
        mockResponseFactory: async () => MOCK_BRIEFS[domain]?.(requirements) ?? { domain, analysis: "", constraints: [], sizing_notes: [], recommendations: [], licensing_flags: [], risks: [] }
      })
  );

  return output;
}

export async function runAllSpecialists(requirements, options = {}) {
  const domains = getActiveSpecialists(requirements);

  const results = await Promise.allSettled(
    domains.map(domain => runSpecialistAgent(domain, requirements, options))
  );

  return results
    .map((result, i) => {
      if (result.status === "fulfilled") return result.value;
      console.warn(`[specialist:${domains[i]}] failed: ${result.reason?.message}`);
      return null;
    })
    .filter(Boolean);
}
