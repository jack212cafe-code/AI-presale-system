# Phase 1: Pipeline Completion - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire all 4 agents (discovery → solution → BOM → proposal) into a single `POST /api/pipeline` endpoint in `server.js`. Persist each stage's output to the `projects` row as it completes. Add `GET /api/projects/:id/status` that returns the full project record. No new agent logic — this phase is orchestration and HTTP plumbing only.

</domain>

<decisions>
## Implementation Decisions

### Pipeline Endpoint Input
- **D-01:** `POST /api/pipeline` accepts a **full intake payload** (same fields as `/api/intake/analyze`). Starts a fresh pipeline from scratch. No resume-from-project-id in this phase.

### Response Style
- **D-02:** **Synchronous** — endpoint blocks until all 4 agents complete and returns the full project record in one response. Streaming/async handling is deferred to Phase 3 (Chat Backend).

### Human Approval Gate
- **D-03:** The pipeline calls `approveProject(projectId)` **automatically** before running the proposal agent. This is intentional — consistent with the project-level decision that the gate is disabled for team self-review. The gate can be re-enabled later by removing this auto-approve call.

### Partial Failure Behavior
- **D-04:** **Save partial + return error.** Whatever stages ran get persisted to Supabase before the failure. Return HTTP 500 with `{ ok: false, stage_failed: "<stage_name>", error: "<message>", project: <partial_record> }` so the caller can see what completed. No rollback.

### Project Status Field Values
- **D-05:** Extend the existing status progression:
  - `intake` → `discovery_complete` → `solution_complete` → `bom_complete` → `proposal_complete`
  - Each stage sets its completion status on the `projects` row when it persists.

### Transaction Scope
- **D-06:** **Sequential updates per stage.** Each agent persists its output to the `projects` row as it completes (same pattern as existing `persistRequirementsJson`, `persistSolutionJson`). Not atomic — consistent with D-04 partial failure behavior.

### Status Endpoint
- **D-07:** `GET /api/projects/:id/status` returns the **full project record** (all columns including solution_json, bom_json, proposal_url). No computed stage map — caller inspects non-null fields to determine what completed.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Pipeline Logic
- `scripts/complete-proposal-flow.js` — Reference implementation of the full agent chain. Planner should follow this pattern when wiring the HTTP endpoint.

### Agent Functions
- `agents/discovery.js` — `runDiscoveryAgent(intake, { projectId })`
- `agents/solution.js` — `runSolutionAgent(requirements, { projectId })`
- `agents/bom.js` — `runBomAgent(solution, { projectId, requirements })`
- `agents/proposal.js` — `runProposalAgent(project, requirements, solution, bom, { projectId })`

### Persistence Layer
- `lib/projects.js` — All persist functions: `persistRequirementsJson`, `persistSolutionJson`, `persistBomJson`, `persistProposalMetadata`, `approveProject`

### Server Patterns
- `server.js` — Existing route pattern (`parseBody`, `json`, `requireAdminAuth`). New routes must follow the same structure.

### Architecture Reference
- `.planning/codebase/ARCHITECTURE.md` — Full data flow, agent signatures, DB schema, dual-mode execution logic

### Requirements
- `.planning/REQUIREMENTS.md` — M1 acceptance criteria: POST /api/pipeline with HCI brief → returns solution + BOM + proposal_path in <60s

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/complete-proposal-flow.js`: Already chains all 4 agents — planner can lift this logic directly into the HTTP handler
- `lib/projects.js → approveProject()`: Call this before `runProposalAgent` to bypass the human_approved gate
- `lib/admin-jobs.js`: In-memory job tracking pattern — available if async is ever needed, but not required for Phase 1

### Established Patterns
- All routes in `server.js` use: `parseBody(request)` → validate → run agent → `json(response, statusCode, payload)`
- All errors caught in try/catch and returned as `{ ok: false, error: message }` with appropriate HTTP status
- `withAgentLogging` wraps every LLM call automatically (no change needed in agents)

### Integration Points
- New route added to `appHandler` in `server.js` alongside existing routes
- `persistProposalMetadata` in `lib/projects.js` resets `human_approved: false` after proposal — this is fine since we auto-approve at pipeline start
- `projects.status` column needs two new valid values: `bom_complete`, `proposal_complete`

</code_context>

<specifics>
## Specific Ideas

- Exit criteria fixture is the HCI scenario from `test/fixtures/*.json` — planner should confirm which fixture file to use
- "One transaction" in roadmap means sequential per-stage saves, not atomic (D-06)
- Proposal agent currently stores `proposal_url` as a local filesystem path — this is known tech debt (CONCERNS.md) and is acceptable for Phase 1

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-pipeline-completion*
*Context gathered: 2026-03-29*
