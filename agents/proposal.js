import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "../lib/config.js";
import { withAgentLogging } from "../lib/logging.js";
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
      assumptions: {
        type: "array",
        items: { type: "string" }
      },
      next_steps: {
        type: "array",
        items: { type: "string" }
      }
    },
    required: ["executive_summary", "solution_overview", "assumptions", "next_steps"]
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
        systemPrompt: prompt,
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

  const proposalPath = path.join(
    outputDir,
    `${project.customer_name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "customer"}-proposal.docx`
  );

  const sanitized = {
    executive_summary: String(draft.executive_summary ?? "").trim(),
    solution_overview: String(draft.solution_overview ?? "").trim(),
    assumptions: Array.isArray(draft.assumptions) ? draft.assumptions : [],
    next_steps: Array.isArray(draft.next_steps) ? draft.next_steps : []
  };

  const buffer = await buildProposalBuffer({
    customerName: project.customer_name,
    projectName: `${project.customer_name} Presale Proposal`,
    executiveSummary: sanitized.executive_summary,
    solutionOverview: sanitized.solution_overview,
    bomRows: bom.rows,
    assumptions: sanitized.assumptions
  });

  await writeFile(proposalPath, buffer);

  if (options.projectId) {
    await persistProposalMetadata(options.projectId, proposalPath);
  }

  return validateProposalMetadata({
    proposal_path: proposalPath,
    sections: ["Executive Summary", "Recommended Solution", "Bill of Materials", "Assumptions"],
    human_approved: false
  });
}
