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
import { getWikiPagesForRequirements } from "../lib/db/wiki.js";

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
            topology: {
              type: "string",
              enum: ["HCI", "3-Tier", "Hybrid", "Backup-Only", "Network-Only", "Security-Only"]
            },
            hypervisor: {
              type: ["string", "null"],
              enum: ["Nutanix AHV", "VMware vSphere", "Proxmox VE", "Azure Stack HCI", "Hyper-V", "N/A", null]
            },
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
          required: ["name", "architecture", "topology", "hypervisor", "vendor_stack", "rationale", "risks", "estimated_tco_thb"]
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
      },
      thai_narrative: { type: "string" }
    },
    required: ["options", "selected_option", "missing_information", "notes", "thai_narrative"]
  }
};

export async function _getKnowledgeWithDeps(requirements, deps, orgId = null) {
  const { embedQueryFn, retrieveVectorFn, retrieveLocalFn, hasSupabaseFn, hasEmbeddingFn } = deps;
  const useCases = Array.isArray(requirements.use_cases) ? requirements.use_cases : [];
  const _t = Date.now();

  // 1. Wiki-First: Priority for structural/portfolio guidance
  let wikiContext = "";
  try {
    // Note: using a simplified search for portfolio/architecture notes based on use cases
    const wikiKeywords = useCases.join(" ").toLowerCase();
    const wikiPages = await deps.getWikiPagesForRequirements(requirements);
    if (wikiPages && wikiPages.length > 0) {
      wikiContext = wikiPages.map(p => `[WIKI: ${p.product_name}] ${p.overview} ${p.positioning}`).join("\n\n");
    }
  } catch (err) {
    logger.warn("solution.wiki_retrieval_failed", { error: err.message });
  }

  if (hasSupabaseFn() && hasEmbeddingFn()) {
    console.log(`[solution:kb] vector-path started useCases=${useCases.length}`);
    try {
      const results = await Promise.allSettled(
        useCases.map(async (useCase) => {
          console.log(`[solution:kb] embed started "${useCase}"`);
          const embedding = await embedQueryFn(useCase);
          console.log(`[solution:kb] +${Date.now()-_t}ms embed done, vector-search started "${useCase}"`);
          const r = await retrieveVectorFn(embedding, 5, orgId);
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

        // Append Wiki context to the top of the knowledge set
        const finalChunks = wikiContext
          ? [{ id: "wiki-context", title: "Portfolio & Architecture Guidance", content: wikiContext, similarity: 1.0 }, ...chunks]
          : chunks;

        return { chunks: finalChunks, retrieval_mode: "vector" };
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

  const finalLocalChunks = wikiContext
    ? [{ id: "wiki-context", title: "Portfolio & Architecture Guidance", content: wikiContext, similarity: 1.0 }, ...chunks]
    : chunks;

  return { chunks: finalLocalChunks, retrieval_mode: "local_fallback" };
}

export async function getKnowledge(requirements, orgId = null) {
  return _getKnowledgeWithDeps(requirements, {
    embedQueryFn: embedQuery,
    retrieveVectorFn: retrieveKnowledgeFromVector,
    retrieveLocalFn: retrieveLocalKnowledge,
    hasSupabaseFn: hasSupabaseAdmin,
    hasEmbeddingFn: hasEmbeddingConfig,
    getWikiPagesForRequirements: getWikiPagesForRequirements
  }, orgId);
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

function inferTopology(option) {
  const text = `${option?.architecture ?? ""} ${(option?.vendor_stack ?? []).join(" ")}`.toLowerCase();
  if (/\bhci\b|hyper[- ]?converged|vxrail|nutanix|simplivity|thinkagile\s*(hx|mx)|vsan|azure\s*stack\s*hci|ceph/.test(text)) return "HCI";
  if (/3[- ]?tier|san[- ]attached|powerstore|powervault|\bde\d{4}|\bdm\d{4}|unity|me5|msa|alletra|nimble/.test(text)) return "3-Tier";
  if (/backup|veeam|commvault|data\s*domain|storeonce/.test(text)) return "Backup-Only";
  if (/fortigate|firewall|ngfw|siem|edr/.test(text)) return "Security-Only";
  if (/switch|catalyst|nexus|aruba|fabric/.test(text)) return "Network-Only";
  return "Hybrid";
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
          topology: option.topology || inferTopology(option),
          hypervisor: option.hypervisor ?? null,
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

const MODEL_TOKEN_PATTERN = /\b([A-Z]{1,4}\d{2,5}[A-Za-z0-9]{0,5})\b/g;
const MODEL_TOKEN_DENYLIST = new Set([
  "GEN10", "GEN11", "GEN12", "DDR4", "DDR5", "RAID5", "RAID6", "RAID10",
  "USB3", "PCIE4", "PCIE5", "FC32", "FC64", "ISO27001", "SOC2", "TLS12", "TLS13",
  "IPV4", "IPV6", "HTTP2", "HTTP3"
]);

function extractModelsByCategory(chunks) {
  const byCategory = new Map();
  for (const chunk of chunks ?? []) {
    const cat = String(chunk?.category ?? "").trim() || "Product";
    const text = `${chunk?.title ?? ""} ${chunk?.content ?? ""}`;
    if (!byCategory.has(cat)) byCategory.set(cat, new Set());
    const bucket = byCategory.get(cat);
    for (const match of text.matchAll(MODEL_TOKEN_PATTERN)) {
      const token = match[1].toUpperCase();
      if (MODEL_TOKEN_DENYLIST.has(token)) continue;
      bucket.add(token);
    }
  }
  const out = {};
  for (const [cat, set] of byCategory) {
    if (set.size === 0) continue;
    out[cat] = Array.from(set).slice(0, 30);
  }
  return out;
}

export function buildVerifiedModelsBlock(chunks) {
  const grouped = extractModelsByCategory(chunks);
  const categories = Object.keys(grouped);
  if (categories.length === 0) {
    return `\n\n[VERIFIED_MODELS — authoritative allowlist]\n(No explicit model numbers were extracted from KB. Describe product families only and set exact model to null; add a note that distributor must confirm.)`;
  }
  const lines = categories.map((cat) => `- ${cat}: ${grouped[cat].join(", ")}`);
  return `\n\n[VERIFIED_MODELS — authoritative allowlist]\nYou MUST select exact model numbers ONLY from this list. If the same family has multiple variants (e.g., DD3300, DD6400, DD6410), pick the newest/highest variant unless customer sizing explicitly requires a smaller one. Never recall obsolete or alternate SKUs from training data when a KB variant exists.\n${lines.join("\n")}`;
}

export async function runSolutionAgent(requirements, options = {}) {
  const prompt = await loadPrompt();
  const { chunks: knowledge, retrieval_mode } = await getKnowledge(requirements, options.orgId ?? null);
  const projectObjective = formatProjectObjective();
  const verifiedModelsBlock = buildVerifiedModelsBlock(knowledge);

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

  let wikiContext = "";
  try {
    const wikiPages = await getWikiPagesForRequirements(requirements);
    if (wikiPages.length > 0) {
      wikiContext = `\n\n[WIKI CONTEXT]\nProduct overview for positioning decisions (use [KNOWLEDGE BASE] for detailed specs):\n${wikiPages.map(p => `- **${p.product_name}** (${p.vendor}, ${p.category}): ${p.overview} Positioning: ${p.positioning}`).join("\n")}`;
    }
  } catch (err) {
    console.error("[solution:wiki] failed to load wiki context:", err.message);
  }

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
        systemPrompt: `${prompt}\n\n[PROJECT OBJECTIVE]\n${projectObjective}${wikiContext}\n\n[KNOWLEDGE BASE]\n${knowledge
          .map((entry) => `${entry.title}\n${entry.content}`)
          .join("\n\n")}${verifiedModelsBlock}${specialistContext}${constraintContext}${memoryContext}`,
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
          validateSolutionOption(opt, {
            user_count: requirements.scale?.user_count,
            requested_topology: opt.topology || requirements.topology || (requirements.use_cases?.join(" ").toLowerCase().includes("hci") ? "HCI" : null)
          }).valid
        );

        if (allOptionsValid) break;

        attempts++;
        const validationErrors = currentOutput.options
          .map((opt, idx) => {
            const res = validateSolutionOption(opt, {
              user_count: requirements.scale?.user_count,
              requested_topology: opt.topology || requirements.topology || (requirements.use_cases?.join(" ").toLowerCase().includes("hci") ? "HCI" : null)
            });
            return res.valid ? null : `Option ${idx + 1}: ${res.errors.join("; ")}`;
          })
          .filter(Boolean)
          .join("\n");


        logger.warn("solution.validation_failed", { attempt: attempts, errors: validationErrors });
        console.log(`[solution] +${Date.now()-_t0}ms self-correction attempt=${attempts}`);

        await new Promise(r => setTimeout(r, 500 * attempts));
        console.log(`[solution] +${Date.now()-_t0}ms openai-${attempts+1} started`);
        currentOutput = await generateJsonWithOpenAI({
          systemPrompt: `${prompt}\n\n[CRITICAL TECHNICAL ERRORS FOUND]\n${validationErrors}\n\nPlease correct these technical errors. Ensure M365 limits, Windows Server socket/core minimums, and storage capacity units (TB/GB) are strictly followed.\n\n[PROJECT OBJECTIVE]\n${projectObjective}${wikiContext}\n\n[KNOWLEDGE BASE]\n${knowledge
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
