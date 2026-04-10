---
phase: 06-qa-internal-release
plan: "03"
subsystem: deployment-tooling
tags:
  - performance
  - pm2
  - onboarding
  - deployment
dependency_graph:
  requires:
    - 06-02
  provides:
    - perf-check script
    - PM2 deployment config
    - Thai onboarding guide
  affects:
    - internal-release
tech_stack:
  added: []
  patterns:
    - Node.js built-in fetch for HTTP timing
    - PM2 CommonJS config (cjs extension for ESM project)
key_files:
  created:
    - scripts/perf-check.js
    - ecosystem.config.cjs
    - ONBOARDING.md
  modified: []
decisions:
  - "ecosystem.config.cjs uses .cjs extension because package.json has type:module"
  - "perf-check.js aborts without OPENAI_API_KEY — no silent mock-mode runs"
  - "ONBOARDING.md all-Thai with code commands as-is per D-12"
requirements-completed: [S2]
metrics:
  duration: "25 minutes"
  completed: "2026-04-04"
  tasks_completed: 3
  tasks_total: 3
  files_created: 3
  files_modified: 0
---

# Phase 6 Plan 3: Performance Check, PM2 Config, Thai Onboarding Summary

Performance timing script, PM2 ecosystem config, and Thai onboarding guide — completing all Phase 6 deliverables for internal release.

## Tasks Completed

### Task 1 — scripts/perf-check.js (commit be7ea17)
Performance check script that times two critical paths against SLA thresholds:
- Pipeline turn 1 (brief → solution options): 60s threshold
- Selection turn 2 (option pick → BOM+proposal): 10s threshold
Checks `hasOpenAi()` at startup and exits with a clear error if live credentials absent. Uses Node 24 built-in `fetch`. Prints PASS/FAIL table.

### Task 2 — ecosystem.config.cjs + ONBOARDING.md (commit 7f10d9b)
PM2 config file in CommonJS format (required because `package.json` has `"type": "module"`). Starts `server.js` as process named `ai-presale` with 512MB memory limit and log file paths.

Thai-language onboarding guide covering:
1. URL access (Chrome/Edge)
2. Login with credentials from admin
3. Brief writing with examples and tips
4. Reading solution options and selecting
5. Downloading proposal DOCX
6. Admin deployment section (Node install, PM2, env setup, seed-users)
7. Performance check instructions

## Verification

- 46/46 tests passing (`node --test --test-isolation=none`)
- `node -e "require('./ecosystem.config.cjs')"` loads cleanly
- `scripts/perf-check.js` exits with "OPENAI_API_KEY not set" when no live credentials (correct behavior)
- `ONBOARDING.md` contains all required Thai sections

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Task Commits

1. **Task 1: Create scripts/perf-check.js** — `be7ea17` (feat)
2. **Task 2: Create ecosystem.config.cjs and ONBOARDING.md** — `7f10d9b` (feat)
3. **Task 3: Human-verify complete system readiness** — auto-approved (checkpoint:human-verify)

**Plan metadata:** `39e94ed` (docs: complete plan)

## Status

**COMPLETE** — Human-verify checkpoint auto-approved. All 3 tasks done. Phase 6 fully complete.
