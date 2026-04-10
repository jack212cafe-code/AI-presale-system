---
phase: 05-solution-quality-rag-hardening
plan: 03
subsystem: validation
tags: [bom-validation, sku-catalog, presale-scenarios, docx, human-review]
dependency_graph:
  requires: [05-01, 05-02]
  provides: [bom-validation-script, docx-sample]
  affects: [scripts/validate-bom-scenarios.js, scripts/complete-proposal-flow.js]
tech_stack:
  added: []
  patterns: [per-scenario-try-catch, KNOWN_SKUS-Set, catalog-match-flagging]
key_files:
  created:
    - scripts/validate-bom-scenarios.js
  modified:
    - scripts/complete-proposal-flow.js
decisions:
  - "BOM validation uses KNOWN_SKUS Set for catalog match checking — inline flag per row"
  - "complete-proposal-flow.js required all validateIntakePayload fields (partner_type, core_pain_point, desired_outcome, trust_priority)"
metrics:
  duration_minutes: 15
  completed_date: "2026-04-02"
  tasks_completed: 1
  tasks_total: 2
  files_changed: 2
status: PARTIAL — awaiting human review (Task 2 checkpoint)
---

# Phase 05 Plan 03: BOM Validation Script Summary (Partial)

**One-liner:** BOM validation script runs 5 presale scenarios through solution+BOM agents, prints comparison tables with per-row catalog match flags against 25 known SKUs.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Create BOM validation script | a9380e2 | scripts/validate-bom-scenarios.js |
| - | [Rule 1 - Bug] Fix complete-proposal-flow.js missing required intake fields | 171b0e2 | scripts/complete-proposal-flow.js |

## What Was Built

### Task 1: BOM Validation Script

`scripts/validate-bom-scenarios.js` runs 5 scenarios sequentially:
- HCI, Backup & Recovery, DR, Cybersecurity, Full Stack
- Loads fixture from `test/fixtures/scenario_*.json`
- Calls `runSolutionAgent` then `runBomAgent` per scenario
- Prints formatted comparison table: part_number, description (40 chars), qty, unit_price, total, catalog_match
- Flags `NOT IN CATALOG` for any part_number not in KNOWN_SKUS (25 SKUs)
- Per-scenario try/catch with error isolation
- Overall summary: scenarios run, total items, total catalog matches

Script output (mock mode, all 5 scenarios ran):
- 5/5 scenarios completed
- 7 total BOM items
- 7/7 catalog matches (100%)

DOCX confirmed at: `output/k-edge-networks-proposal.docx`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed missing required intake fields in complete-proposal-flow.js**
- **Found during:** Task 2 DOCX pre-condition check
- **Issue:** `normalizeIntakePayload` throws for missing `partner_type`, `core_pain_point`, `desired_outcome`, `trust_priority` — script crashed before DOCX could be generated
- **Fix:** Added all 4 required fields with representative values to the fixture object in complete-proposal-flow.js
- **Files modified:** scripts/complete-proposal-flow.js
- **Commit:** 171b0e2

## Status: PAUSED AT CHECKPOINT

Task 2 (`checkpoint:human-verify`, gate=blocking) requires human review of:
1. BOM validation output quality (all 5 scenario tables)
2. Proposal text quality (Thai language, enterprise quality)
3. DOCX formatting (professionally formatted, Thai text correct)

DOCX path: `output/k-edge-networks-proposal.docx`

## Self-Check: PARTIAL

- scripts/validate-bom-scenarios.js: FOUND
- scripts/complete-proposal-flow.js: FOUND (fixed)
- output/k-edge-networks-proposal.docx: GENERATED
- commit a9380e2: FOUND
- commit 171b0e2: FOUND
