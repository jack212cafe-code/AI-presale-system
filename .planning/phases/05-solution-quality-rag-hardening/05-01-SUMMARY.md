---
phase: 05-solution-quality-rag-hardening
plan: "01"
subsystem: agents/solution
tags: [rag, retrieval, dedup, unit-test, fixtures]
dependency_graph:
  requires: []
  provides: [per-use-case-retrieval, dedup-by-chunk-id, top5-cap, getKnowledge-export]
  affects: [agents/solution.js, test/fixtures, test/unit]
tech_stack:
  added: []
  patterns: [Promise.allSettled, dependency-injection, Map-dedup]
key_files:
  created:
    - test/fixtures/scenario_cybersecurity.json
    - test/fixtures/scenario_fullstack.json
    - test/unit/getKnowledge.test.js
  modified:
    - agents/solution.js
decisions:
  - "Use _getKnowledgeWithDeps helper with dependency injection for testability (mock.module not available in Node 24 ESM)"
  - "Promise.allSettled over use_cases.map for resilience — partial failures don't abort entire retrieval"
  - "Fallback to local_fallback when zero fulfilled vector results rather than returning empty chunks"
metrics:
  duration: "15m"
  completed_date: "2026-04-02"
  tasks_completed: 3
  files_changed: 4
---

# Phase 05 Plan 01: Per-Use-Case RAG Retrieval Refactor Summary

Per-use-case vector retrieval with Map-based dedup, top-5 cap, and exported getKnowledge with 5 unit tests.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create missing test fixtures | d177999 | test/fixtures/scenario_cybersecurity.json, test/fixtures/scenario_fullstack.json |
| 2 | Refactor getKnowledge to per-use-case retrieval | d21cce3 | agents/solution.js |
| 3 | Unit test for getKnowledge behavior | d4720c6 | agents/solution.js, test/unit/getKnowledge.test.js |

## Decisions Made

- **Dependency injection via `_getKnowledgeWithDeps`:** `mock.module()` is not available in Node 24 ESM test runner. Extracted the pure retrieval logic into `_getKnowledgeWithDeps(requirements, deps)` which accepts injected functions. `getKnowledge` wraps it with production deps. Both are exported.
- **`Promise.allSettled` for resilience:** Partial per-use-case failures don't abort the entire retrieval — fulfilled results are collected and deduped.
- **Zero-fulfilled fallthrough:** If all vector calls are fulfilled but return empty (or zero fulfilled), code falls through to local_fallback rather than returning empty chunks.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Testability] Added `_getKnowledgeWithDeps` dependency injection helper**
- **Found during:** Task 3 (RED phase)
- **Issue:** `mock.module()` is not a function in Node 24 ESM test runner; cannot mock imports without loaders
- **Fix:** Extracted retrieval logic into `_getKnowledgeWithDeps(requirements, deps)` accepting injected fns; `getKnowledge` delegates to it with production deps. Both exported.
- **Files modified:** agents/solution.js
- **Commit:** d4720c6

## Verification

- `node scripts/smoke.js --mock` passes (full pipeline with mock mode)
- `node --test test/unit/getKnowledge.test.js` passes (5/5 tests)
- agents/solution.js exports both `runSolutionAgent` and `getKnowledge` and `_getKnowledgeWithDeps`
- Two new fixture files exist as valid JSON with 15 keys each

## Known Stubs

None.

## Self-Check: PASSED

- test/fixtures/scenario_cybersecurity.json: FOUND (d177999)
- test/fixtures/scenario_fullstack.json: FOUND (d177999)
- agents/solution.js (refactored): FOUND (d21cce3, d4720c6)
- test/unit/getKnowledge.test.js: FOUND (d4720c6)
- All commits verified in git log
