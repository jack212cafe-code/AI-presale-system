import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "../lib/config.js";
import { formatProjectObjective } from "../lib/project-context.js";
import { withAgentLogging } from "../lib/logging.js";
import { generateJsonWithOpenAI } from "../lib/openai.js";
import { validateRequirements } from "../lib/validation.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function deriveUseCases(intake) {
  const content = `${intake.primary_use_case} ${intake.notes}`.toLowerCase();
  const useCases = [];

  if (content.includes("backup")) useCases.push("Backup & Recovery");
  if (content.includes("dr") || content.includes("disaster")) useCases.push("Disaster Recovery");
  if (content.includes("security") || content.includes("ransomware")) useCases.push("Cybersecurity");
  if (content.includes("hci") || content.includes("virtual") || content.includes("vm")) useCases.push("HCI");

  if (useCases.length === 0) {
    useCases.push(intake.primary_use_case);
  }

  return [...new Set(useCases)];
}

async function loadPrompt() {
  return readFile(path.join(__dirname, "_prompts", "discovery.md"), "utf8");
}

const discoveryTextFormat = {
  type: "json_schema",
  name: "discovery_requirements",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      customer_profile: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: ["string", "null"] },
          industry: { type: ["string", "null"] },
          environment: { type: ["string", "null"] }
        },
        required: ["name", "industry", "environment"]
      },
      partner_context: {
        type: "object",
        additionalProperties: false,
        properties: {
          partner_type: { type: ["string", "null"] },
          operating_model: { type: ["string", "null"] },
          engagement_motion: { type: ["string", "null"] }
        },
        required: ["partner_type", "operating_model", "engagement_motion"]
      },
      use_cases: {
        type: "array",
        items: { type: "string" }
      },
      pain_points: {
        type: "array",
        items: { type: "string" }
      },
      desired_outcomes: {
        type: "array",
        items: { type: "string" }
      },
      trust_requirements: {
        type: "array",
        items: { type: "string" }
      },
      workflow_blockers: {
        type: "array",
        items: { type: "string" }
      },
      recommended_next_questions: {
        type: "array",
        items: { type: "string" }
      },
      success_criteria: {
        type: "array",
        items: { type: "string" }
      },
      scale: {
        type: "object",
        additionalProperties: false,
        properties: {
          users: { type: ["number", "integer", "null"] },
          vm_count: { type: ["number", "integer", "null"] },
          storage_tb: { type: ["number", "integer", "null"] }
        },
        required: ["users", "vm_count", "storage_tb"]
      },
      budget_range: { type: ["string", "null"] },
      timeline: { type: ["string", "null"] },
      constraints: {
        type: "array",
        items: { type: "string" }
      },
      gaps: {
        type: "array",
        items: { type: "string" }
      },
      source_mode: { type: ["string", "null"] }
    },
    required: [
      "customer_profile",
      "partner_context",
      "use_cases",
      "pain_points",
      "desired_outcomes",
      "trust_requirements",
      "workflow_blockers",
      "recommended_next_questions",
      "success_criteria",
      "scale",
      "budget_range",
      "timeline",
      "constraints",
      "gaps",
      "source_mode"
    ]
  }
};

function buildMockRequirements(intake) {
  return {
    customer_profile: {
      name: intake.customer_name,
      industry: intake.industry,
      environment: "Cloud SaaS for SI/Distributor partners"
    },
    partner_context: {
      partner_type: intake.partner_type,
      operating_model: "Busy generalist presale workflow",
      engagement_motion: "Supports sales conversations and customer follow-up"
    },
    use_cases: [
      "Multi-Agent SaaS",
      "Partner Enablement",
      "Presale Productivity",
      "Results Trust",
      ...deriveUseCases(intake)
    ],
    pain_points: [intake.core_pain_point],
    desired_outcomes: [intake.desired_outcome],
    trust_requirements: [intake.trust_priority],
    workflow_blockers: [
      "Requirements may arrive incomplete from sales",
      "User may need a usable answer before all technical details are confirmed"
    ],
    recommended_next_questions: intake.users
      ? ["What deliverable format is needed first: brief, BOM, or both?"]
      : ["How many internal or customer users should this design support?"],
    success_criteria: [
      "Output is trustworthy enough to reuse in the next sales or customer conversation",
      "User can identify the next key questions without extra presale escalation"
    ],
    scale: {
      users: intake.users,
      vm_count: intake.vm_count,
      storage_tb: intake.storage_tb
    },
    budget_range: intake.budget_range_thb,
    timeline: intake.timeline,
    constraints: intake.notes ? [intake.notes] : [],
    gaps: intake.users ? [] : ["User count not confirmed"],
    source_mode: "mock"
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

function sanitizeRequirements(output, intake) {
  const requirements = output && typeof output === "object" ? output : {};
  const customerProfile =
    requirements.customer_profile && typeof requirements.customer_profile === "object"
      ? requirements.customer_profile
      : { name: intake.customer_name, industry: intake.industry };
  const scale =
    requirements.scale && typeof requirements.scale === "object"
      ? requirements.scale
      : {
          users: intake.users,
          vm_count: intake.vm_count,
          storage_tb: intake.storage_tb
        };

  return {
    customer_profile: customerProfile,
    partner_context:
      requirements.partner_context && typeof requirements.partner_context === "object"
        ? {
            partner_type: requirements.partner_context.partner_type ?? intake.partner_type,
            operating_model:
              requirements.partner_context.operating_model ??
              "Busy generalist presale workflow",
            engagement_motion:
              requirements.partner_context.engagement_motion ??
              "Supports sales and customer-facing presale work"
          }
        : {
            partner_type: intake.partner_type,
            operating_model: "Busy generalist presale workflow",
            engagement_motion: "Supports sales and customer-facing presale work"
          },
    use_cases: toArray(requirements.use_cases).length > 0 ? toArray(requirements.use_cases) : deriveUseCases(intake),
    pain_points: toArray(requirements.pain_points).length > 0 ? toArray(requirements.pain_points) : toArray(intake.core_pain_point),
    desired_outcomes:
      toArray(requirements.desired_outcomes).length > 0
        ? toArray(requirements.desired_outcomes)
        : toArray(intake.desired_outcome),
    trust_requirements:
      toArray(requirements.trust_requirements).length > 0
        ? toArray(requirements.trust_requirements)
        : toArray(intake.trust_priority),
    workflow_blockers: toArray(requirements.workflow_blockers),
    recommended_next_questions: toArray(requirements.recommended_next_questions),
    success_criteria: toArray(requirements.success_criteria),
    scale,
    budget_range: requirements.budget_range ?? intake.budget_range_thb,
    timeline: requirements.timeline ?? intake.timeline,
    constraints: toArray(requirements.constraints),
    gaps: toArray(requirements.gaps),
    source_mode: requirements.source_mode ?? "live"
  };
}

export async function runDiscoveryAgent(intake, options = {}) {
  const prompt = await loadPrompt();
  const projectObjective = formatProjectObjective();

  const output = await withAgentLogging(
    {
      agentName: "discovery",
      projectId: options.projectId,
      modelUsed: config.openai.models.discovery,
      input: intake
    },
    () =>
      generateJsonWithOpenAI({
        systemPrompt: `${prompt}\n\n[PROJECT OBJECTIVE]\n${projectObjective}`,
        userPrompt: JSON.stringify(intake, null, 2),
        model: config.openai.models.discovery,
        textFormat: discoveryTextFormat,
        mockResponseFactory: async () => buildMockRequirements(intake)
      })
  );

  return validateRequirements(sanitizeRequirements(output, intake));
}
