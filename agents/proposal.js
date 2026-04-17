import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "../lib/config.js";
import { withAgentLogging } from "../lib/logger.js";
import { generateJsonWithOpenAI } from "../lib/openai.js";
import { buildProposalBuffer } from "../lib/proposal.js";
import { validateProposalMetadata } from "../lib/validation.js";
import { getProjectById, persistProposalMetadata } from "../lib/projects.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

async function loadPrompt() {
  return readFile(path.join(__dirname, "_prompts", "proposal.md"), "utf8");
}

const proposalTextFormat = {
  type: "json_schema",
  name: "proposal_content",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      executive_summary: { type: "string" },
      solution_overview: { type: "string" },
      options_considered: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            rationale: { type: "string" }
          },
          required: ["name", "rationale"]
        }
      },
      assumptions: {
        type: "array",
        items: { type: "string" }
      },
      risks: {
        type: "array",
        items: { type: "string" }
      },
      missing_info: {
        type: "array",
        items: { type: "string" }
      },
      next_steps: {
        type: "array",
        items: { type: "string" }
      },
      why_section: {
        type: "object",
        additionalProperties: false,
        properties: {
          problem_framing: { type: "string" },
          why_architecture: { type: "array", items: { type: "string" } },
          trade_offs: { type: "string" },
          risk_mitigations: { type: "string" }
        },
        required: ["problem_framing", "why_architecture", "trade_offs", "risk_mitigations"]
      }
    },
    required: ["executive_summary", "solution_overview", "options_considered", "assumptions", "risks", "missing_info", "next_steps", "why_section"]
  }
};

function buildMockDraft(project, solution) {
  const selected = solution.options[solution.selected_option ?? 0];
  return {
    executive_summary: `This proposal recommends ${selected.architecture} for ${project.customer_name} to improve resilience, scalability, and delivery speed.`,
    solution_overview: `Recommended vendors: ${selected.vendor_stack.join(", ")}. The design targets enterprise workloads while keeping rollout and support manageable for a lean delivery model.`,
    assumptions: [
      "Final sizing requires customer workshop confirmation.",
      "Pricing excludes taxes, partner services, and vendor promotions unless explicitly stated.",
      "Customer approval is required before any external delivery."
    ]
  };
}

export async function runProposalAgent(project, requirements, solution, bom, options = {}) {
  const prompt = await loadPrompt();

  const selectedIdx = solution.selected_option ?? 0;
  const selectedOption = solution.options?.[selectedIdx] ?? solution.options?.[0];

  const draft = await withAgentLogging(
    {
      agentName: "proposal",
      projectId: options.projectId,
      modelUsed: config.openai.models.proposal,
      input: {
        project,
        requirements,
        solution,
        bom
      }
    },
    () =>
      generateJsonWithOpenAI({
        systemPrompt: options.budgetWarning
          ? `${prompt}\n\n[BUDGET WARNING]\n${options.budgetWarning}\nMention this in executive_summary and assumptions.`
          : prompt,
        userPrompt: JSON.stringify(
          {
            project,
            requirements,
            solution,
            bom
          },
          null,
          2
        ),
        model: config.openai.models.proposal,
        textFormat: proposalTextFormat,
        timeoutMs: 45_000,
        mockResponseFactory: async () => buildMockDraft(project, solution)
      })
  );

  if (options.projectId) {
    const record = await getProjectById(options.projectId);
    if (record && !record.human_approved) {
      throw new Error(
        `Proposal delivery blocked: project ${options.projectId} has not been approved. Call POST /api/projects/${options.projectId}/approve first.`
      );
    }
  }

  const outputDir = options.outputDir || path.join(projectRoot, "output");
  await mkdir(outputDir, { recursive: true });

  const nameSlug = (() => {
    const ascii = (project.customer_name || "").match(/[a-zA-Z0-9]+/g);
    if (ascii && ascii.length > 0) return ascii.join("-").toLowerCase();
    return `customer-${Date.now()}`;
  })();
  const proposalPath = path.join(outputDir, `${nameSlug}-proposal.docx`);

  const sanitized = {
    executive_summary: String(draft.executive_summary ?? "").trim(),
    solution_overview: String(draft.solution_overview ?? "").trim(),
    options_considered: Array.isArray(draft.options_considered) ? draft.options_considered : [],
    assumptions: Array.isArray(draft.assumptions) ? draft.assumptions : [],
    risks: Array.isArray(draft.risks) ? draft.risks : [],
    missing_info: Array.isArray(draft.missing_info) ? draft.missing_info : [],
    next_steps: Array.isArray(draft.next_steps) ? draft.next_steps : [],
    why_section: draft.why_section && typeof draft.why_section === "object" ? {
      problem_framing: String(draft.why_section.problem_framing ?? "").trim(),
      why_architecture: Array.isArray(draft.why_section.why_architecture) ? draft.why_section.why_architecture : [],
      trade_offs: String(draft.why_section.trade_offs ?? "").trim(),
      risk_mitigations: String(draft.why_section.risk_mitigations ?? "").trim()
    } : null
  };

  const buffer = await buildProposalBuffer({
    customerName: project.customer_name,
    projectName: `${project.customer_name} Presale Proposal`,
    executiveSummary: sanitized.executive_summary,
    solutionOverview: sanitized.solution_overview,
    solutionArchitecture: selectedOption?.architecture ?? null,
    solutionTopology: selectedOption?.topology ?? null,
    solutionHypervisor: selectedOption?.hypervisor ?? null,
    solutionVendors: selectedOption?.vendor_stack ?? [],
    bomRows: (bom.rows ?? []).filter(r => r.category !== "GROUNDING WARNING"),
    optionsConsidered: sanitized.options_considered,
    assumptions: sanitized.assumptions,
    risks: sanitized.risks,
    missingInfo: sanitized.missing_info,
    nextSteps: sanitized.next_steps,
    whySection: sanitized.why_section
  });

  await writeFile(proposalPath, buffer);

  if (options.projectId) {
    await persistProposalMetadata(options.projectId, proposalPath);
  }

  return validateProposalMetadata({
    proposal_path: proposalPath,
    sections: ["Executive Summary", "Recommended Solution", "Options Considered", "Bill of Materials", "Assumptions", "Project Risks", "Information Required", "Next Steps"],
    human_approved: false
  });
}
