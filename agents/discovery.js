import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "../lib/config.js";
import { formatProjectObjective } from "../lib/project-context.js";
import { withAgentLogging } from "../lib/logger.js";
import { generateJsonWithOpenAI } from "../lib/openai.js";
import { validateRequirements } from "../lib/validation.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CATEGORY_TO_USE_CASES = {
  "HCI":        ["HCI"],
  "3-Tier":     ["3-Tier"],
  "DR":         ["Disaster Recovery"],
  "Backup":     ["Backup & Recovery"],
  "Security":   ["Cybersecurity"],
  "Full-stack": ["HCI", "3-Tier", "Disaster Recovery", "Backup & Recovery", "Cybersecurity"]
};

const DISCOVERY_DEFAULTS = {
  vm_count: 50,
  storage_tb: 20,
  users: 100,
  budget_range_thb: "3,000,000-5,000,000 THB",
  network: "10G"
};

function deriveUseCases(intake) {
  const content = `${intake.primary_use_case} ${intake.notes} ${intake.core_pain_point} ${intake.desired_outcome}`.toLowerCase();
  const useCases = [];

  if (content.includes("backup")) useCases.push("Backup & Recovery");
  if (content.includes("dr") || content.includes("disaster")) useCases.push("Disaster Recovery");
  if (content.includes("security") || content.includes("ransomware")) useCases.push("Cybersecurity");
  const isHci = content.includes("hci") || content.includes("hyperconverge") || content.includes("nutanix") || content.includes("simplivity") || content.includes("vxrail");
  if (isHci) useCases.push("HCI");
  if (!isHci && (content.includes("3-tier") || content.includes("3 tier") || content.includes("server") || content.includes("storage appliance") || content.includes("san") || content.includes("nas"))) useCases.push("3-Tier");

  if (useCases.length === 0) {
    useCases.push(intake.primary_use_case);
  }

  return [...new Set(useCases)];
}

async function loadPrompt() {
  return readFile(path.join(__dirname, "_prompts", "discovery.md"), "utf8");
}

const discoveryQuestionsFormat = {
  type: "json_schema",
  name: "discovery_questions_output",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      question_text: { type: "string" },
      hints: {
        type: "array",
        items: { type: "string" }
      }
    },
    required: ["question_text", "hints"]
  }
};

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
          storage_tb: { type: ["number", "integer", "null"] },
          vm_count_3yr: { type: ["number", "integer", "null"] }
        },
        required: ["users", "vm_count", "storage_tb", "vm_count_3yr"]
      },
      existing_infrastructure: {
        type: "object",
        additionalProperties: false,
        properties: {
          switches: { type: ["string", "null"] },
          rack_power_kw: { type: ["number", "null"] },
          fiber_available: { type: ["boolean", "null"] },
          notes: { type: ["string", "null"] }
        },
        required: ["switches", "rack_power_kw", "fiber_available", "notes"]
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
      source_mode: { type: ["string", "null"] },
      category: {
        type: "string",
        enum: ["HCI", "3-Tier", "DR", "Backup", "Security", "Full-stack"]
      },
      assumptions_applied: {
        type: "array",
        items: { type: "string" }
      }
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
      "existing_infrastructure",
      "budget_range",
      "timeline",
      "constraints",
      "gaps",
      "source_mode",
      "category",
      "assumptions_applied"
    ]
  }
};

function buildMockRequirements(intake, mode) {
  if (mode === "generate_questions") {
    return {
      question_text: "สวัสดีครับ ผมเข้าใจว่าคุณต้องการระบบโครงสร้างพื้นฐานสำหรับองค์กร ช่วยบอกรายละเอียดเพิ่มเติมได้ไหมครับ เช่น มี VM อยู่ประมาณกี่ตัว storage รวมประมาณกี่ TB จำนวน user ทั้งหมด network switch ที่ใช้อยู่เป็น 10G หรือ 25G และงบประมาณคร่าวๆ ครับ",
      hints: [
        "ถ้าลูกค้าบอก VM เกิน 80 ตัว → แนะนำ HCI เพราะ 3-Tier จะ scale ยากและแพงกว่าในระยะยาว",
        "ถ้า storage ที่ต้องการเกิน 50 TB → ควรถามว่ามี SAN/NAS อยู่แล้วหรือยัง เพื่อประเมินว่า reuse ได้ไหม",
        "ถ้าลูกค้ามี switch แค่ 1G → HCI แบบ Ceph จะมีปัญหา storage traffic ต้องเสนอ upgrade switch ก่อน",
        "ถ้างบต่ำกว่า 3 ล้าน → เน้นเฉพาะ core use case เดียว ไม่ควรเสนอ full-stack",
        "ถ้าลูกค้าพูดถึง VMware → ควรถามเรื่องงบ license เพราะหลัง Broadcom ราคาขึ้น 2-3 เท่า"
      ]
    };
  }

  return {
    customer_profile: {
      name: intake.customer_name,
      industry: intake.industry ?? null,
      environment: "On-premise enterprise infrastructure"
    },
    partner_context: {
      partner_type: intake.partner_type,
      operating_model: "Busy generalist presale workflow",
      engagement_motion: "Supports sales conversations and customer follow-up"
    },
    use_cases: deriveUseCases(intake),
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
      users: intake.users ?? null,
      vm_count: intake.vm_count ?? DISCOVERY_DEFAULTS.vm_count,
      storage_tb: intake.storage_tb ?? DISCOVERY_DEFAULTS.storage_tb,
      vm_count_3yr: null
    },
    existing_infrastructure: {
      switches: null,
      rack_power_kw: null,
      fiber_available: null,
      notes: null
    },
    budget_range: intake.budget_range_thb ?? DISCOVERY_DEFAULTS.budget_range_thb,
    timeline: intake.timeline ?? null,
    constraints: intake.notes ? [intake.notes] : [],
    gaps: intake.users ? [] : ["User count not confirmed"],
    source_mode: "mock",
    category: "HCI",
    explicit_fields: {
      users: Boolean(intake.users)
    },
    assumptions_applied: []
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

function hasExplicitUserCount(discoveryReply, intake) {
  if (intake.users != null) return true;
  if (!discoveryReply || typeof discoveryReply !== "string") return false;
  return /\b(\d{1,4})\s*(users?|people|persons?|คน)\b/i.test(discoveryReply);
}

function sanitizeRequirements(output, intake, discoveryReply) {
  const requirements = output && typeof output === "object" ? output : {};
  const explicitUsers = hasExplicitUserCount(discoveryReply, intake);
  const customerProfile =
    requirements.customer_profile && typeof requirements.customer_profile === "object"
      ? requirements.customer_profile
      : { name: intake.customer_name, industry: intake.industry ?? null };
  const scale =
    requirements.scale && typeof requirements.scale === "object"
      ? {
          ...requirements.scale,
          users: explicitUsers ? (requirements.scale.users ?? intake.users ?? null) : null,
          vm_count: requirements.scale.vm_count ?? intake.vm_count ?? null,
          storage_tb: requirements.scale.storage_tb ?? intake.storage_tb ?? null,
          vm_count_3yr: requirements.scale.vm_count_3yr ?? null,
          growth_rate: requirements.scale.growth_rate ?? null,
          storage_tb_3yr: requirements.scale.storage_tb_3yr ?? null
        }
      : {
          users: explicitUsers ? (intake.users ?? null) : null,
          vm_count: intake.vm_count ?? null,
          storage_tb: intake.storage_tb ?? null,
          vm_count_3yr: null
        };

  const existingInfrastructure =
    requirements.existing_infrastructure && typeof requirements.existing_infrastructure === "object"
      ? requirements.existing_infrastructure
      : { switches: null, rack_power_kw: null, fiber_available: null, notes: null };

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
    existing_infrastructure: existingInfrastructure,
    budget_range: requirements.budget_range ?? intake.budget_range_thb ?? null,
    timeline: requirements.timeline ?? intake.timeline ?? null,
    constraints: toArray(requirements.constraints),
    gaps: toArray(requirements.gaps),
    source_mode: requirements.source_mode ?? "live",
    category: requirements.category ?? null,
    explicit_fields: {
      users: explicitUsers
    },
    assumptions_applied: computeAssumptions(scale, requirements.budget_range, intake)
  };
}

function computeAssumptions(scale, budgetRange, intake) {
  const assumptions = [];
  if (scale.vm_count === DISCOVERY_DEFAULTS.vm_count && !intake.vm_count) {
    assumptions.push(`ใช้ค่าเริ่มต้น: VM ${DISCOVERY_DEFAULTS.vm_count} ตัว`);
  }
  if (scale.storage_tb === DISCOVERY_DEFAULTS.storage_tb && !intake.storage_tb) {
    assumptions.push(`ใช้ค่าเริ่มต้น: Storage ${DISCOVERY_DEFAULTS.storage_tb} TB`);
  }
  if ((!budgetRange || budgetRange === "Unknown") && (!intake.budget_range_thb || intake.budget_range_thb === "Unknown")) {
    assumptions.push(`ใช้ค่าเริ่มต้น: งบ ${DISCOVERY_DEFAULTS.budget_range_thb}`);
  }
  return assumptions;
}

export async function runDiscoveryAgent(intake, options = {}) {
  const mode = options.mode ?? "parse_answers";
  const discoveryReply = options.discoveryReply ?? null;
  const prompt = await loadPrompt();
  const projectObjective = formatProjectObjective();

  const textFormat = mode === "generate_questions" ? discoveryQuestionsFormat : discoveryTextFormat;

  const userPrompt =
    mode === "generate_questions"
      ? JSON.stringify({ mode: "generate_questions", brief: intake }, null, 2)
      : JSON.stringify({ mode: "parse_answers", brief: intake, discovery_reply: discoveryReply, defaults: DISCOVERY_DEFAULTS }, null, 2);

  const output = await withAgentLogging(
    {
      agentName: "discovery",
      projectId: options.projectId,
      modelUsed: config.openai.models.discovery,
      input: { mode, intake }
    },
    () =>
      generateJsonWithOpenAI({
        systemPrompt: `${prompt}\n\n[PROJECT OBJECTIVE]\n${projectObjective}`,
        userPrompt,
        model: config.openai.models.discovery,
        textFormat,
        timeoutMs: 45_000,
        mockResponseFactory: async () => buildMockRequirements(intake, mode)
      })
  );

  if (mode === "generate_questions") {
    return output;
  }

  const sanitized = sanitizeRequirements(output, intake, discoveryReply);
  const validated = validateRequirements(sanitized);

  // Map category to use_cases ONLY if derived use_cases is weak (0-1 items)
  if (validated.category && CATEGORY_TO_USE_CASES[validated.category]) {
    if (validated.use_cases.length <= 1) {
      validated.use_cases = CATEGORY_TO_USE_CASES[validated.category];
    }
  }

  return validated;
}
