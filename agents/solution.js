import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config, hasEmbeddingConfig, hasSupabaseAdmin } from "../lib/config.js";
import { withAgentLogging } from "../lib/logging.js";
import { embedQuery, generateJsonWithOpenAI } from "../lib/openai.js";
import { formatProjectObjective } from "../lib/project-context.js";
import { persistSolutionJson } from "../lib/projects.js";
import { validateSolution } from "../lib/validation.js";
import { retrieveKnowledgeFromVector } from "../lib/supabase.js";
import { retrieveLocalKnowledge } from "../knowledge_base/shared.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadPrompt() {
  return readFile(path.join(__dirname, "_prompts", "solution.md"), "utf8");
}

const solutionTextFormat = {
  type: "json_schema",
  name: "solution_options",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      options: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            architecture: { type: "string" },
            vendor_stack: {
              type: "array",
              items: { type: "string" }
            },
            rationale: {
              type: "array",
              items: { type: "string" }
            },
            risks: {
              type: "array",
              items: { type: "string" }
            },
            estimated_tco_thb: { type: ["number", "integer", "null"] }
          },
          required: ["name", "architecture", "vendor_stack", "rationale", "risks", "estimated_tco_thb"]
        }
      },
      selected_option: { type: ["integer", "null"] },
      notes: {
        type: "array",
        items: { type: "string" }
      }
    },
    required: ["options", "selected_option", "notes"]
  }
};

export async function getKnowledge(requirements) {
  const useCases = Array.isArray(requirements.use_cases) ? requirements.use_cases : [];

  if (hasSupabaseAdmin() && hasEmbeddingConfig()) {
    try {
      const results = await Promise.allSettled(
        useCases.map(async (useCase) => {
          const embedding = await embedQuery(useCase);
          return retrieveKnowledgeFromVector(embedding, 5);
        })
      );

      const fulfilled = results.filter((r) => r.status === "fulfilled").flatMap((r) => r.value);

      if (fulfilled.length === 0) {
        console.warn("[solution] All per-use-case vector retrievals failed, falling back to local keyword search");
      } else {
        const byId = new Map();
        for (const chunk of fulfilled) {
          const existing = byId.get(chunk.id);
          if (!existing || chunk.similarity > existing.similarity) {
            byId.set(chunk.id, chunk);
          }
        }
        const chunks = Array.from(byId.values())
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 5);
        return { chunks, retrieval_mode: "vector" };
      }
    } catch (err) {
      console.warn(`[solution] Vector retrieval failed, falling back to local keyword search: ${err.message}`);
    }
  }

  const localResults = await Promise.allSettled(useCases.map((uc) => retrieveLocalKnowledge(uc, 5)));
  const localFulfilled = localResults.filter((r) => r.status === "fulfilled").flatMap((r) => r.value);
  const byKey = new Map();
  for (const chunk of localFulfilled) {
    const existing = byKey.get(chunk.source_key);
    if (!existing || (chunk.score || 0) > (existing.score || 0)) {
      byKey.set(chunk.source_key, chunk);
    }
  }
  const chunks = Array.from(byKey.values())
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 5);
  return { chunks, retrieval_mode: "local_fallback" };
}

function buildMockSolution(requirements, knowledge, retrieval_mode) {
  const includesBackup = requirements.use_cases.some((item) => item.toLowerCase().includes("backup"));
  const includesDr = requirements.use_cases.some((item) => item.toLowerCase().includes("disaster"));

  return {
    options: [
      {
        name: "Primary Recommendation",
        architecture: includesBackup ? "HCI + Backup" : "HCI core platform",
        vendor_stack: includesBackup ? ["Nutanix", "Veeam"] : ["Nutanix"],
        rationale: [
          "Keeps the primary stack simple for a one-person presale workflow.",
          "Aligns with common enterprise virtualization and recovery requirements."
        ],
        risks: includesDr ? ["DR dependency mapping still needs workshop validation."] : ["Pricing needs vendor refresh."],
        estimated_tco_thb: 2800000
      },
      {
        name: "Alternative Option",
        architecture: includesDr ? "3-Tier + DR-ready backup" : "3-Tier virtualization platform",
        vendor_stack: includesDr ? ["Dell", "Veeam"] : ["Dell"],
        rationale: [
          "Provides a conservative option for customers preferring traditional architecture.",
          "Can map well to phased deployments."
        ],
        risks: ["Higher integration and operations overhead than the primary recommendation."],
        estimated_tco_thb: 3200000
      }
    ],
    selected_option: 0,
    notes: knowledge.map((entry) => entry.title),
    retrieval_mode
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

function sanitizeSolution(output, knowledge) {
  const solution = output && typeof output === "object" ? output : {};
  const options = Array.isArray(solution.options)
    ? solution.options
        .filter((option) => option && typeof option === "object")
        .map((option) => ({
          name: String(option.name || "Recommended Option").trim(),
          architecture: String(option.architecture || "Architecture not specified").trim(),
          vendor_stack: toArray(option.vendor_stack),
          rationale: toArray(option.rationale),
          risks: toArray(option.risks),
          estimated_tco_thb:
            option.estimated_tco_thb === null || option.estimated_tco_thb === undefined
              ? null
              : Number(option.estimated_tco_thb)
        }))
    : [];

  return {
    options,
    selected_option:
      Number.isInteger(solution.selected_option) && solution.selected_option >= 0 ? solution.selected_option : 0,
    notes: toArray(solution.notes).length > 0 ? toArray(solution.notes) : knowledge.map((entry) => entry.title),
    retrieval_mode: solution.retrieval_mode || "unknown"
  };
}

export async function runSolutionAgent(requirements, options = {}) {
  const prompt = await loadPrompt();
  const { chunks: knowledge, retrieval_mode } = await getKnowledge(requirements);
  const projectObjective = formatProjectObjective();

  const output = await withAgentLogging(
    {
      agentName: "solution_design",
      projectId: options.projectId,
      modelUsed: config.openai.models.solution,
      input: {
        requirements,
        knowledge_titles: knowledge.map((entry) => entry.title),
        retrieval_mode
      }
    },
    () =>
      generateJsonWithOpenAI({
        systemPrompt: `${prompt}\n\n[PROJECT OBJECTIVE]\n${projectObjective}\n\n[KNOWLEDGE BASE]\n${knowledge
          .map((entry) => `${entry.title}\n${entry.content}`)
          .join("\n\n")}`,
        userPrompt: JSON.stringify(requirements, null, 2),
        model: config.openai.models.solution,
        textFormat: solutionTextFormat,
        maxOutputTokens: 5000,
        mockResponseFactory: async () => buildMockSolution(requirements, knowledge, retrieval_mode)
      })
  );

  const solution = validateSolution(sanitizeSolution({ ...output, retrieval_mode }, knowledge));

  if (options.projectId) {
    await persistSolutionJson(options.projectId, solution);
  }

  return solution;
}
