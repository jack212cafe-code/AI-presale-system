import { normalizeIntakePayload } from "../lib/intake.js";
import { createProjectRecord } from "../lib/projects.js";
import { runDiscoveryAgent } from "../agents/discovery.js";
import { runSolutionAgent } from "../agents/solution.js";
import { runBomAgent } from "../agents/bom.js";
import { runProposalAgent } from "../agents/proposal.js";

const intake = normalizeIntakePayload({
  customer_name: "K-Edge Networks",
  partner_type: "System Integrator",
  industry: "IT Services",
  primary_use_case: "DR-ready HCI + immutable backup",
  core_pain_point: "Legacy infrastructure lacks DR capability and immutable backup.",
  desired_outcome: "Resilient HCI platform with immutable backup and warm DR site.",
  trust_priority: "Accuracy first",
  users: 400,
  vm_count: 150,
  storage_tb: 120,
  budget_range_thb: "3M-5M THB",
  timeline: "60 days",
  notes: "Need immutable backup plus warm DR with cloud fallback."
});

const projectResult = await createProjectRecord(intake);
const projectId = projectResult.project?.id;

const requirements = await runDiscoveryAgent(intake);
const solution = await runSolutionAgent(requirements);
const bom = await runBomAgent(solution, { projectId });
const proposal = await runProposalAgent(intake, requirements, solution, bom, { projectId });

console.log(
  JSON.stringify(
    {
      project_id: projectId,
      bom,
      proposal,
      persisted: projectResult.saved
    },
    null,
    2
  )
);
