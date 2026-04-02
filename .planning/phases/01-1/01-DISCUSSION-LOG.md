# Phase 1: Pipeline Completion - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 01-pipeline-completion
**Areas discussed:** Pipeline input, Sync vs async, Approval gate, Partial failure, Status endpoint, Status values, Transaction scope

---

## Pipeline Input

| Option | Description | Selected |
|--------|-------------|----------|
| Full intake payload | Same fields as /api/intake/analyze — start fresh | ✓ |
| project_id to resume | Accept existing project ID, run remaining stages | |
| Both (auto-detect) | Branch on presence of project_id | |

**User's choice:** Full intake payload (recommended default accepted)

---

## Sync vs Async Response

| Option | Description | Selected |
|--------|-------------|----------|
| Synchronous — block and return | Block until all 4 agents complete, return full result | ✓ |
| Async — return job ID, poll status | Return immediately, client polls status endpoint | |

**User's choice:** Synchronous (recommended default accepted)

---

## Human Approval Gate

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-approve at pipeline start | Call approveProject() before proposal step | ✓ |
| Bypass by skipping projectId | Don't pass projectId to proposal agent | |

**User's choice:** Auto-approve (recommended default accepted)
**Notes:** Consistent with project-level decision that gate is disabled for team self-review.

---

## Partial Failure Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Save partial + return error | Persist completed stages, return 500 with stage_failed | ✓ |
| Fail fast, no partial save | Nothing saved if any stage fails | |
| Retry failed stage once | Auto-retry before surfacing error | |

**User's choice:** Save partial + return error (recommended default accepted)

---

## Status Endpoint Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Full project record | Return all columns from projects row | ✓ |
| Computed stage map | Return discovery/solution/bom/proposal: done/pending | |

**User's choice:** Full project record (recommended default accepted)

---

## Status Field Values

| Option | Description | Selected |
|--------|-------------|----------|
| bom_complete → proposal_complete | Follow existing pattern | ✓ |
| pipeline_complete (single final) | One new status value after proposal | |

**User's choice:** bom_complete → proposal_complete (recommended default accepted)

---

## Transaction Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Sequential updates per stage | Each stage saves as it completes | ✓ |
| Atomic all-or-nothing | Buffer in memory, one final write | |

**User's choice:** Sequential updates per stage (recommended default accepted)

---

## Claude's Discretion

None — all areas had clear recommendations that were accepted.

## Deferred Ideas

None raised during discussion.
