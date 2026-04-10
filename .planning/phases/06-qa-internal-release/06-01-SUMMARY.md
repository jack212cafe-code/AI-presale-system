---
phase: 06-qa-internal-release
plan: "01"
subsystem: chat-backend
tags: [error-handling, timeout, kb-miss, api]
dependency_graph:
  requires: []
  provides: [chat-error-contract]
  affects: [chat-frontend, server-api]
tech_stack:
  added: []
  patterns: [Promise.race timeout, ok:false error contract, KB miss detection]
key_files:
  created: []
  modified:
    - lib/chat.js
    - server.js
decisions:
  - "withTimeout wraps both stage handlers at 60s (not per-agent) — simplest coverage for S2"
  - "HTTP 200 (not 500) for handled errors — frontend fetch gets parseable JSON without network-level error"
  - "KB miss check uses use_cases ?? useCases for field name flexibility"
metrics:
  duration_minutes: 12
  completed_date: "2026-04-04"
  tasks_completed: 2
  files_modified: 2
---

# Phase 06 Plan 01: Chat Pipeline Error Hardening Summary

JWT auth with refresh rotation using jose library

One-liner: Hardened chat pipeline with 60s timeout wrapper, KB miss detection (empty use_cases), and consistent `{ ok: false, error }` error contract across all 4 error paths and HTTP layer.

## What Was Built

- `withTimeout(fn, ms=60000)` — Promise.race wrapper using PIPELINE_TIMEOUT_MS constant
- KB miss detection in `handleGreeting` after `runDiscoveryAgent` — returns `ok: false` with Thai fallback when `use_cases` is empty
- `ok: false` added to all 4 error paths in `handleChatMessage`: greeting catch, selection catch, conversation not found, unexpected stage
- `server.js` chat handler updated to check `result.ok === false || result.stage === "error"` and return `{ ok: false, error: result.text }` with HTTP 200

## Deviations from Plan

None - plan executed exactly as written.

## Test Results

- 43/43 tests pass (full suite)
- chat.test.js: 9/9 pass
- Module loads without errors

## Self-Check: PASSED

Files created/modified:
- FOUND: lib/chat.js
- FOUND: server.js

Commits:
- bf5a5be: feat(06-01): add withTimeout, KB miss detection, consistent ok:false error shapes
- 0601e68: feat(06-01): map stage:error to ok:false HTTP response in chat handler
