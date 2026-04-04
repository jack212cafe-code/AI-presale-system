---
phase: 06-qa-internal-release
plan: "02"
subsystem: chat-ui-testing
tags: [testing, frontend, error-handling, e2e]
dependency_graph:
  requires: [06-01]
  provides: [chat-error-e2e-tests, chat-frontend-error-ui]
  affects: [test/chat.test.js, chat/chat.js, chat/chat.html]
tech_stack:
  added: []
  patterns: [inline-error-bubble, retry-button-pattern, ok-false-detection]
key_files:
  created: []
  modified:
    - test/chat.test.js
    - chat/chat.js
    - chat/chat.html
decisions:
  - "Frontend detects payload.ok === false at application layer (HTTP 200) separately from HTTP-level errors (!response.ok)"
  - "Multi-turn stage progression tests documented as Supabase-only manual tests — not automated in mock mode"
  - "appendErrorBubble renders inline (not banner) to keep error context close to conversation"
metrics:
  duration_minutes: 20
  completed_date: "2026-04-04"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
---

# Phase 6 Plan 02: Chat E2E Error Tests and Frontend Error UI Summary

E2E chat tests for S2 error contract + inline error bubble with Thai retry button in chat.js.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Extend test/chat.test.js with error-path and stage-progression tests | 260bb81 | test/chat.test.js |
| 2 | Add error rendering and retry button to chat/chat.js | 64d9e1e | chat/chat.js, chat/chat.html |

## Verification

- `node --test --test-isolation=none` — 46/46 tests pass
- `node --test --test-isolation=none test/chat.test.js` — 12/12 tests pass (3 new error-path tests)
- All acceptance criteria verified via node -e checks

## Key Changes

**test/chat.test.js** — Added `describe("error handling (S2)")` with 3 tests:
1. First turn returns `stage:awaiting_selection` with text, conversation_id, project_id
2. Invalid conversation_id returns `ok:false` with error string
3. Whitespace-only message returns 400 with `ok:false`
Multi-turn Supabase progression documented as manual-only.

**chat/chat.js** — Error detection and retry:
- `lastUserMessage` state variable tracks last sent text
- `sendMessage()` saves `lastUserMessage = text.trim()` before send
- After API response, checks `payload.ok === false || payload.stage === "error"` before HTTP error check
- `appendErrorBubble(errorText)` renders inline error with Thai retry button
- Retry button removes error bubble and re-calls `sendMessage(lastUserMessage)`

**chat/chat.html** — Added CSS: `.error-bubble`, `.error-text`, `.retry-btn`, `.retry-btn:hover`

## Decisions Made

- Frontend detects `payload.ok === false` at application layer (HTTP 200) separately from `!response.ok` (HTTP 4xx/5xx) — matches Plan 01 error contract where some errors return HTTP 200 with ok:false body
- Multi-turn tests require Supabase persistence; documented as manual-only to keep CI green in mock mode
- Inline error bubble (not banner) keeps error context close to conversation thread for better UX

## Deviations from Plan

**1. [Rule 3 - Blocking] Windows/POSIX path split prevented direct file writes**
- **Found during:** Task 2
- **Issue:** Git worktree on Windows has path translation mismatch between Node.js (backslash paths) and bash (POSIX paths) — Write tool and Node fs.writeFileSync succeeded but bash/git could not access the files at POSIX paths
- **Fix:** Used `git hash-object -w` + `git update-index --cacheinfo` to stage content directly into git index bypassing filesystem path issues
- **Files modified:** chat/chat.js, chat/chat.html
- **Commit:** 64d9e1e

## Known Stubs

None — all changes are functional implementations.

## Self-Check: PASSED

- Commits verified: `git log --oneline` shows 260bb81 and 64d9e1e
- `git show HEAD:chat/chat.js` contains `lastUserMessage`, `appendErrorBubble`, `payload.ok === false`
- `git show HEAD:chat/chat.html` contains `error-bubble`, `retry-btn`
- 46 tests pass: `node --test --test-isolation=none` exits 0
