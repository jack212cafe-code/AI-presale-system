# AI Presale System Execution Plan

Purpose: break delivery into trackable execution phases with the same operating loop in every phase while preserving the current product direction:

- free-first adoption before monetization
- solve real SI/Distributor presale pain points first
- empathy as the company DNA across every AI agent role
- minimal, results-first UI
- trustworthy, exportable outputs that feel like having a real presale engineer

Execution loop in every phase:

1. Research
2. Plan
3. Execute
4. Evaluate

## Progress Model

Recommended status values for tracking:

- `Not Started`
- `In Progress`
- `Blocked`
- `Done`

Recommended fields per task:

- Owner
- Status
- Target date
- Notes
- Risks

---

## Phase 0: Foundation Baseline

Goal: confirm the scaffold, development workflow, and execution boundaries before integrating external systems.

### Discuss

- Align on the scaffold scope and mock vs integrated expectations with stakeholders.
- Confirm the baseline acceptance criteria derived from the project doc, README, and Claude notes.
- Agree on how frequently the team will revisit the goal before moving into Phase 1.

### Research

- Review the current scaffold structure and confirm the intended runtime boundaries: local app, Supabase, OpenAI generation, OpenAI embeddings, n8n.
- Identify what is already implemented versus what is placeholder.
- Confirm operating assumptions for local mode versus integrated mode.
- Review the source of truth in [`AI_Presale_System_ProjectDoc.docx`](C:\Users\Pitsanu\AI-presale-system\AI_Presale_System_ProjectDoc.docx), [`README.md`](C:\Users\Pitsanu\AI-presale-system\README.md), and [`CLAUDE.md`](C:\Users\Pitsanu\AI-presale-system\CLAUDE.md).

### Plan

- Freeze the initial Phase 1 scope: intake, discovery, solution, BOM, proposal, human approval.
- Define the minimal acceptance criteria for a “working integrated baseline”.
- Decide what stays mocked temporarily and what must be connected first.

### Execute

- Keep the scaffold as the baseline.
- Confirm `npm install`, `npm test`, `npm run smoke`, and local `server.js` startup remain green.
- Record current technical debt and placeholders.

### Evaluate

- Exit when the team agrees the repo baseline is stable enough for integration work.
- Output: baseline checklist, known gaps list, and agreed acceptance criteria.

---

## Phase 1: Environment and Secrets Setup

Goal: make the project runnable against real services without changing core flow design.

### Discuss

- Review available Supabase, OpenAI, embedding, and n8n secrets with the team before wiring them into `.env`.
- Confirm what parts of the stack must remain local until the credentials are verified.
- Agree on the required validation checkpoints for each external service.

### Research

- Collect required credentials and endpoints for Supabase, OpenAI generation, OpenAI embeddings, and n8n.
- Validate deployment target and environment separation: local, staging, production.
- Identify data sensitivity and secret-handling requirements.

### Plan

- Define the `.env` contract for all services.
- Decide which secrets are mandatory now and which can remain optional.
- Define a minimal connectivity validation flow for each dependency.

### Execute

- Populate `.env` from [`.env.example`](C:\Users\Pitsanu\AI-presale-system\.env.example).
- Configure Supabase project, API keys, and service role key.
- Configure OpenAI and Supabase keys plus the n8n callback URL.
- Confirm local connectivity using small health-check scripts or direct runtime checks.

### Evaluate

- Exit when all required external services can be reached from the app.
- Output: environment readiness checklist and unresolved credential/access blockers.

---

## Phase 2: Database and Knowledge Base Readiness

Goal: make Supabase the real persistence layer and prepare KB data that is usable for RAG.

### Discuss

- Align on the schema changes and audit fields needed for Phase 1 data capture.
- Review the KB taxonomy (category/source/metadata) with stakeholders and finalize priorities.
- Clarify the pricing catalog scope and how it should evolve over Phase 2.

### Research

- Review [`supabase/schema.sql`](C:\Users\Pitsanu\AI-presale-system\supabase\schema.sql) against real Phase 1 data needs.
- Identify missing tables, columns, indexes, or audit fields.
- Audit available source content for KB seeding: product specs, sizing rules, pricing, anonymized past projects, SaaS product strategy notes, UX principles, partner pain points, and presale playbooks.
- Estimate minimum KB coverage needed for useful retrieval.

### Plan

- Finalize schema changes before live usage.
- Define KB taxonomy: category, source, vendor, product family, revision date, trust level, and whether the knowledge is vendor, pattern, question-framework, or product-direction guidance.
- Define a KB seed batch plan: critical first, then high-value additions.

### Execute

- Apply schema in Supabase.
- Seed initial pricing and KB content.
- Run [`knowledge_base/embed.js`](C:\Users\Pitsanu\AI-presale-system\knowledge_base\embed.js) with real embedding credentials.
- Validate row counts, embedding population, and retrieval quality.

### Evaluate

- Exit when the DB persists projects/logs correctly and KB retrieval returns relevant results for core scenarios.
- Output: schema version note, KB inventory, and retrieval quality observations.

---

## Phase 3: Intake to Project Record Flow

Goal: ensure the first stage of the pipeline reliably converts customer input into a valid project record.

### Discuss

- Confirm the intake payload contract and which fields are mandatory versus optional.
- Align on server-side validation behavior and how errors should surface to the intake form.
- Decide how intake data maps to the `projects` table before implementing persistence.
- Confirm which inputs are needed to validate SI/Distributor pain points, free-first adoption goals, and trust-in-results expectations.

### Research

- Review expected input channels: web form and manual owner input.
- Identify required versus optional fields for intake, especially around pain points, workflow friction, export needs, onboarding expectations, and trust requirements.
- Review failure cases: missing required fields, malformed values, partial submissions.

### Plan

- Define the final intake payload contract.
- Decide how input validation errors should be surfaced.
- Define the project record shape written to Supabase.
- Keep the intake minimal on the surface, but rich enough to drive trustworthy results and product-market-fit learning.

### Execute

- Harden [`intake/index.html`](C:\Users\Pitsanu\AI-presale-system\intake\index.html), [`intake/submit.js`](C:\Users\Pitsanu\AI-presale-system\intake\submit.js), and [`server.js`](C:\Users\Pitsanu\AI-presale-system\server.js).
- Write intake records to `projects`.
- Add test coverage for valid and invalid payloads.

### Evaluate

- Exit when intake submissions reliably create valid project records and errors are understandable.
- Output: intake contract, validation results, and sample saved project records.

---

## Phase 4: Discovery Agent Integration

Goal: replace mock discovery logic with production-grade model output and persistence.

### Discuss

- Agree on the discovery JSON schema version and what downstream fields are required.
- Discuss prompt guardrails and null handling rules to avoid malformed outputs.
- Confirm logging needs, including token/duration capture, before wiring agent logs.
- Confirm that discovery should prioritize real partner pain points, adoption blockers, and gaps that matter for a free-first SaaS product.
- Confirm that discovery must behave empathetically for overloaded generalist users who may not know how to state requirements well.

### Research

- Review current prompt and output schema in [`agents/discovery.js`](C:\Users\Pitsanu\AI-presale-system\agents\discovery.js) and [`agents/_prompts/discovery.md`](C:\Users\Pitsanu\AI-presale-system\agents\_prompts\discovery.md).
- Identify edge cases where customer requirements are ambiguous or incomplete.
- Decide what parts of inference are safe for the model versus what should remain explicit.

### Plan

- Lock the JSON schema for discovery output.
- Define prompt guardrails, null handling, and gap capture rules.
- Define logging requirements for model input/output/tokens/duration.
- Ensure discovery captures what will prove or disprove product-market fit for SI/Distributor workflows.

### Execute

- Integrate OpenAI for live discovery generation.
- Persist `requirements_json` to `projects`.
- Log every run to `agent_logs`.
- Add regression tests using real-world intake fixtures.

### Evaluate

- Exit when discovery output is structured, repeatable enough, and useful for downstream solution design.
- Output: prompt version, schema version, and error/quality findings.

---

## Phase 5: Solution Design Agent with RAG

Goal: produce defensible solution options backed by KB retrieval instead of generic model knowledge.

### Discuss

- Align on acceptable retrieval precision and KB evidence depth for the solution options.
- Confirm the output schema for multi-option recommendations before finalizing prompts.
- Decide on acceptable automated fallback behavior when KB coverage is insufficient.
- Confirm that solution options should optimize first for user trust, usability, and presale value before monetization structure.

### Research

- Measure current retrieval quality against HCI, backup, DR, and cybersecurity scenarios.
- Identify weak or missing KB areas causing poor recommendations.
- Review how many chunks are needed for useful context without adding prompt noise.

### Plan

- Finalize retrieval method: vector match count, filtering, metadata usage, fallback behavior.
- Define the output shape for multi-option solution design.
- Define what constitutes an acceptable recommendation quality threshold.
- Keep solution recommendations aligned with minimal UI, actionable results, and the feeling of having a real presale engineer.

### Execute

- Integrate live embedding lookup and Supabase vector retrieval in [`agents/solution.js`](C:\Users\Pitsanu\AI-presale-system\agents\solution.js).
- Persist `solution_json` to `projects`.
- Tune prompt and retrieval parameters using target scenarios.
- Add tests for low-data and conflicting-data conditions.

### Evaluate

- Exit when solution options are grounded in KB evidence and owner review finds them credible.
- Output: retrieval tuning notes, scenario results, and KB gap backlog.

---

## Phase 6: BOM and Pricing Accuracy

Goal: move BOM generation from fallback assumptions to controlled pricing logic.

### Discuss

- Review BOM fields, rounding, and presentation expectations with stakeholders.
- Agree on pricing catalog refresh cadence and how stale data should be surfaced.
- Define escalation rules when BOM items reference missing or outdated SKUs.

### Research

- Review required price sources, update cadence, and pricing freshness rules.
- Identify mandatory BOM fields and formatting requirements.
- List common pricing failure modes: stale pricing, missing SKUs, mismatched bundles.

### Plan

- Define pricing catalog maintenance process.
- Define BOM calculation rules and rounding behavior.
- Define escalation behavior when pricing data is incomplete.

### Execute

- Replace fallback pricing path in [`agents/bom.js`](C:\Users\Pitsanu\AI-presale-system\agents\bom.js) with real catalog usage.
- Persist `bom_json` to `projects`.
- Add validation for missing pricing and stale entries.
- Add scenario tests that compare BOM outputs against manual expectations.

### Evaluate

- Exit when BOM outputs are structurally correct and materially close to manual presale results.
- Output: BOM accuracy notes, missing price coverage report, and pricing refresh SOP.

---

## Phase 7: Proposal Generation and Review Gate

Goal: generate usable proposal documents and enforce the mandatory human approval step.

### Discuss

- Confirm the desired proposal structure, section order, and tone with the business owner.
- Agree on whether the DOCX builder suffices or if a binary template is needed.
- Define the approval state machine and audit trail before gating delivery.
- Confirm that proposal and summary outputs should feel directly usable by SI/Distributor teams without decorative or low-signal presentation.

### Research

- Review what a customer-ready proposal must contain for Thai enterprise presale use.
- Confirm formatting expectations, branding needs, and optional sections.
- Define the minimum approval state machine for safe delivery.

### Plan

- Finalize proposal section structure and document tone.
- Decide whether code-generated DOCX is sufficient or a binary template is needed.
- Define human approval flow, audit trail, and final delivery rules.

### Execute

- Improve [`agents/proposal.js`](C:\Users\Pitsanu\AI-presale-system\agents\proposal.js) and [`lib/proposal.js`](C:\Users\Pitsanu\AI-presale-system\lib\proposal.js).
- Persist `proposal_url` to `projects`.
- Implement approval status transitions and block outbound delivery until `human_approved = true`.
- Add tests for approved and unapproved proposal states.

### Evaluate

- Exit when proposals are readable, professional, and cannot bypass human review.
- Output: document sample set, approval flow validation, and presentation quality notes.

---

## Phase 8: Orchestration in n8n

Goal: connect all stages into a durable end-to-end workflow with resumable state.

### Discuss

- Align on the stage split between Node runtime and n8n orchestration.
- Review retry, pause, and resume boundaries to ensure idempotent behavior.
- Confirm required notifications and review callbacks before wiring the workflow.

### Research

- Review which steps should run inside n8n versus the Node runtime.
- Identify failure boundaries, retry rules, and resume points.
- Confirm how notifications and owner actions should be triggered.

### Plan

- Finalize workflow stages, handoff contracts, and retry policy.
- Define idempotency strategy so repeated executions do not corrupt project state.
- Define observability requirements for workflow runs.

### Execute

- Replace starter [`n8n/workflow.json`](C:\Users\Pitsanu\AI-presale-system\n8n\workflow.json) with a real workflow.
- Wire intake trigger, agent execution, DB persistence, review wait state, and response handling.
- Add notification hooks for owner review.

### Evaluate

- Exit when an intake can traverse the full workflow and recover safely from common failures.
- Output: workflow export, retry matrix, and incident handling notes.

---

## Phase 9: QA, Reliability, and Production Readiness

Goal: validate the system under real presale scenarios before production use.

### Discuss

- Confirm the QA scenario slate and derived pass/fail criteria with stakeholders.
- Agree on the operational and monitoring metrics that must be collected.
- Define the rollback and incident response expectations before go-live.

### Research

- Select representative scenarios: HCI + Backup, DR only, full stack, incomplete customer brief, pricing gap case, and SaaS partner-enablement cases for SI/Distributor.
- Identify non-functional risks: latency, token cost, malformed JSON, DB write failure, retrieval irrelevance.
- Review logging completeness, output trustworthiness, and operational support needs.

### Plan

- Define the QA matrix and pass/fail criteria.
- Define monitoring and cost-tracking requirements.
- Define rollback and hotfix process for production issues.

### Execute

- Run end-to-end QA using real or anonymized scenarios.
- Track output quality, cycle time, BOM variance, and failure rates.
- Fix prompt, schema, logic, and workflow defects found during QA.

### Evaluate

- Exit when the system meets the agreed baseline for correctness, usability, and operational safety.
- Output: QA report, go-live recommendation, and post-launch backlog.

---

## Suggested Tracking Board

Use one card per phase and break each card into these sub-items:

- Research
- Plan
- Execute
- Evaluate

Recommended board columns:

1. Backlog
2. Research
3. Plan
4. Execute
5. Evaluate
6. Done
7. Blocked

---

## Immediate Next Phase Recommendation

Continue with:

1. Phase 3: Intake to Project Record Flow
2. Phase 4: Discovery Agent Integration
3. Phase 5: Solution Design Agent with RAG

Reason: the biggest remaining risk is not connectivity anymore. It is whether the intake, discovery, and result experience prove real presale value for SI/Distributor users under the new free-first product direction.
