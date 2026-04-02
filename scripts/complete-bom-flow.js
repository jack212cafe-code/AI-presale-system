import { normalizeIntakePayload } from "../lib/intake.js";
import { createProjectRecord } from "../lib/projects.js";
import { runSolutionAgent } from "../agents/solution.js";
import { runBomAgent } from "../agents/bom.js";

const intake = normalizeIntakePayload({
  customer_name: "Test Project",
  industry: "IT Services",
  primary_use_case: "Backup modernization",
  users: 250,
  vm_count: 70,
  storage_tb: 40,
  budget_range_thb: "2M-3M THB",
  timeline: "90 days",
  notes: "Need immutable backups + warm DR"
});

const projectResult = await createProjectRecord(intake);
const projectId = projectResult.project?.id;

const requirements = await runSolutionAgent({
  customer_profile: { name: intake.customer_name, industry: intake.industry, environment: null },
  use_cases: ["Backup & Recovery", "Disaster Recovery"],
  scale: { users: intake.users, vm_count: intake.vm_count, storage_tb: intake.storage_tb },
  budget_range: intake.budget_range_thb,
  timeline: intake.timeline,
  constraints: [intake.notes],
  gaps: [],
  source_mode: "mock"
});

const bom = await runBomAgent(requirements, { projectId });

console.log(
  JSON.stringify(
    {
      project_id: projectId,
      bom,
      supabase: projectResult.saved ? "persisted" : "mocked"
    },
    null,
    2
  )
);
