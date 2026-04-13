import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config, hasEmbeddingConfig, hasSupabaseAdmin } from "../lib/config.js";
import { withAgentLogging } from "../lib/logger.js";
import { embedQuery, generateJsonWithOpenAI } from "../lib/openai.js";
import { formatProjectObjective } from "../lib/project-context.js";
import { persistSolutionJson } from "../lib/projects.js";
import { validateSolution } from "../lib/validation.js";
import { retrieveKnowledgeFromVector } from "../lib/supabase.js";
import { retrieveLocalKnowledge } from "../knowledge_base/shared.js";
import { validateSolutionOption } from "../lib/sizing-validator.js";
import { logger } from "../lib/logger.js";

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
      missing_information: {
        type: "array",
        items: { type: "string" }
      },
      notes: {
        type: "array",
        items: { type: "string" }
      }
    },
    required: ["options", "selected_option", "missing_information", "notes"]
  }
};

export async function _getKnowledgeWithDeps(requirements, deps) {
  const { embedQueryFn, retrieveVectorFn, retrieveLocalFn, hasSupabaseFn, hasEmbeddingFn } = deps;
  const useCases = Array.isArray(requirements.use_cases) ? requirements.use_cases : [];
  const _t = Date.now();

  if (hasSupabaseFn() && hasEmbeddingFn()) {
    console.log(`[solution:kb] vector-path started useCases=${useCases.length}`);
    try {
      const results = await Promise.allSettled(
        useCases.map(async (useCase) => {
          console.log(`[solution:kb] embed started "${useCase}"`);
          const embedding = await embedQueryFn(useCase);
          console.log(`[solution:kb] +${Date.now()-_t}ms embed done, vector-search started "${useCase}"`);
          const r = await retrieveVectorFn(embedding, 5);
          console.log(`[solution:kb] +${Date.now()-_t}ms vector-search done "${useCase}" hits=${r.length}`);
          return r;
        })
      );
      console.log(`[solution:kb] +${Date.now()-_t}ms vector-path done`);

      const fulfilled = results.filter((r) => r.status === "fulfilled").flatMap((r) => r.value);

      if (fulfilled.length === 0) {
        logger.warn("solution.kb_fallback_all", { reason: "all vector retrievals failed" });
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
      logger.warn("solution.kb_fallback", { use_case: useCase, error: err.message });
    }
  }

  const localResults = await Promise.allSettled(useCases.map((uc) => retrieveLocalFn(uc, 5)));
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

export async function getKnowledge(requirements) {
  return _getKnowledgeWithDeps(requirements, {
    embedQueryFn: embedQuery,
    retrieveVectorFn: retrieveKnowledgeFromVector,
    retrieveLocalFn: retrieveLocalKnowledge,
    hasSupabaseFn: hasSupabaseAdmin,
    hasEmbeddingFn: hasEmbeddingConfig
  });
}

function buildMockSolution(requirements, knowledge, retrieval_mode) {
  const includesBackup = requirements.use_cases.some((item) => item.toLowerCase().includes("backup"));
  const includesDr = requirements.use_cases.some((item) => item.toLowerCase().includes("disaster"));

  return {
    options: [
      {
        name: "Primary Recommendation",
        architecture: includesBackup ? "HCI + Backup" : "HCI core platform",
        vendor_stack: includesBackup ? ["Dell", "Veeam"] : ["Dell"],
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

  // AI-ism Safety Net: Detect and strip common generic phrases
  const aiIsms = [
    /ผมขอแนะนำ/g, /ในสรุปแล้ว/g, /เป็นเรื่องสำคัญที่จะต้องทราบว่า/g, /นอกจากนี้/g, /ยิ่งไปกว่านั้น/g,
    /Based on the information provided/gi, /In conclusion/gi, /I recommend/gi, /It is important to note/gi, /Moreover/gi, /Furthermore/gi
  ];

  const stripAIisms = (text) => {
    if (typeof text !== "string") return text;
    let cleaned = text;
    aiIsms.forEach(regex => {
      cleaned = cleaned.replace(regex, "");
    });
    return cleaned.trim();
  };

  const options = Array.isArray(solution.options)
    ? solution.options
        .filter((option) => option && typeof option === "object")
        .map((option) => ({
          name: String(option.name || "Recommended Option").trim(),
          architecture: stripAIisms(String(option.architecture || "Architecture not specified").trim()),
          vendor_stack: toArray(option.vendor_stack),
          rationale: toArray(option.rationale).map(stripAIisms),
          risks: toArray(option.risks).map(stripAIisms),
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
    notes: toArray(solution.notes).length > 0 ? toArray(solution.notes).map(stripAIisms) : knowledge.map((entry) => entry.title),
    retrieval_mode: solution.retrieval_mode || "unknown"
  };
}

export function buildSolutionMemoryContext(requirements) {
  let memoryContext = "";
  if (requirements.vendor_preferences) {
    const vp = requirements.vendor_preferences;
    if (vp.preferred?.length > 0) {
      memoryContext += `\n\n[VENDOR PREFERENCES — HARD REQUIREMENT]\nThe customer EXPLICITLY requested these vendors. You MUST include at least one option using each preferred vendor. Do NOT propose an option that ignores all preferred vendors.\nRequired vendors: ${vp.preferred.join(", ")}\nIf you propose a 3-option list and none use the required vendors, that is a FAILURE. At minimum Option 1 must use the required vendors.`;
    }
    if (vp.disliked?.length > 0) {
      memoryContext += `\n\n[VENDORS TO EXCLUDE]\nThe customer explicitly rejected these vendors — do NOT include them in any option:\n${vp.disliked.join(", ")}`;
    }
  }
  return memoryContext;
}

export async function runSolutionAgent(requirements, options = {}) {
  const prompt = await loadPrompt();
  const { chunks: knowledge, retrieval_mode } = await getKnowledge(requirements);
  const projectObjective = formatProjectObjective();

  let specialistContext = "";
  if (Array.isArray(options.specialistBriefs) && options.specialistBriefs.length > 0) {
    const sections = options.specialistBriefs.map(brief => {
      const label = { dell_presale: "Dell Presale Engineer", hpe_presale: "HPE Presale Engineer", lenovo_presale: "Lenovo Presale Engineer", neteng: "Network Engineer", devops: "DevOps/Management", ai_eng: "AI Engineer" }[brief.domain] ?? brief.domain;
      return `### ${label} Brief\n${JSON.stringify(brief, null, 2)}`;
    });
    specialistContext = `\n\n[SPECIALIST BRIEFS]\nThe following domain experts have analyzed this requirement. Use their constraints and sizing as ground truth.\n\n${sections.join("\n\n")}`;
  }

  let constraintContext = "";
  if (Array.isArray(requirements.constraints) && requirements.constraints.filter(Boolean).length > 0) {
    constraintContext = `\n\n[HARD CONSTRAINTS — MUST NOT VIOLATE]\nExtracted from customer discovery. Every recommended option must satisfy all of these:\n${requirements.constraints.filter(Boolean).map(c => `- ${c}`).join("\n")}`;
  }

  const memoryContext = buildSolutionMemoryContext(requirements);

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
    async () => {
      const _t0 = Date.now();
      console.log(`[solution] openai-1 started`);
      let currentOutput = await generateJsonWithOpenAI({
        systemPrompt: `${prompt}\n\n[PROJECT OBJECTIVE]\n${projectObjective}\n\n[KNOWLEDGE BASE]\n${knowledge
          .map((entry) => `${entry.title}\n${entry.content}`)
          .join("\n\n")}${specialistContext}${constraintContext}${memoryContext}`,
        userPrompt: JSON.stringify(requirements, null, 2),
        model: config.openai.models.solution,
        textFormat: solutionTextFormat,
        maxOutputTokens: 5000,
        timeoutMs: 60_000,
        mockResponseFactory: async () => buildMockSolution(requirements, knowledge, retrieval_mode)
      });
      console.log(`[solution] +${Date.now()-_t0}ms openai-1 done`);

      // Logic Enforcement: Self-Correction Loop
      let attempts = 0;
      const MAX_ATTEMPTS = 1;

      while (attempts < MAX_ATTEMPTS) {
        if (!Array.isArray(currentOutput.options) || currentOutput.options.length === 0) break;

        const allOptionsValid = currentOutput.options.every(opt =>
          validateSolutionOption(opt, { user_count: requirements.scale?.user_count }).valid
        );

        if (allOptionsValid) break;

        attempts++;
        const validationErrors = currentOutput.options
          .map((opt, idx) => {
            const res = validateSolutionOption(opt, { user_count: requirements.scale?.user_count });
            return res.valid ? null : `Option ${idx + 1}: ${res.errors.join("; ")}`;
          })
          .filter(Boolean)
          .join("\n");

        logger.warn("solution.validation_failed", { attempt: attempts, errors: validationErrors });
        console.log(`[solution] +${Date.now()-_t0}ms self-correction attempt=${attempts}`);

        await new Promise(r => setTimeout(r, 500 * attempts));
        console.log(`[solution] +${Date.now()-_t0}ms openai-${attempts+1} started`);
        currentOutput = await generateJsonWithOpenAI({
          systemPrompt: `${prompt}\n\n[CRITICAL TECHNICAL ERRORS FOUND]\n${validationErrors}\n\nPlease correct these technical errors. Ensure M365 limits, Windows Server socket/core minimums, and storage capacity units (TB/GB) are strictly followed.\n\n[PROJECT OBJECTIVE]\n${projectObjective}\n\n[KNOWLEDGE BASE]\n${knowledge
            .map((entry) => `${entry.title}\n${entry.content}`)
            .join("\n\n")}${specialistContext}${constraintContext}${memoryContext}`,
          userPrompt: `Previous incorrect output:\n${JSON.stringify(currentOutput)}\n\nRequirements:\n${JSON.stringify(requirements, null, 2)}`,
          model: config.openai.models.solution,
          textFormat: solutionTextFormat,
          maxOutputTokens: 5000,
          timeoutMs: 60_000,
        });
        console.log(`[solution] +${Date.now()-_t0}ms openai-${attempts+1} done`);
      }

      return currentOutput;
    }
  );

  const solution = validateSolution(sanitizeSolution({ ...output, retrieval_mode }, knowledge));

  if (options.projectId) {
    await persistSolutionJson(options.projectId, solution);
  }

  return solution;
}
