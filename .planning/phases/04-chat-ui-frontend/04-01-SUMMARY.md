---
phase: 04-chat-ui-frontend
plan: "01"
subsystem: server-routing
tags: [routing, static-files, api-endpoints, conversations]
dependency_graph:
  requires: []
  provides: [chat-static-routes, login-static-routes, proposal-download-endpoint, conversation-messages-endpoint, conversations-by-project-endpoint]
  affects: [server.js, lib/conversations.js]
tech_stack:
  added: []
  patterns: [serveFile-pattern, requireUserAuth-pattern, regex-route-matching]
key_files:
  created: [test/chat.test.js (Phase 04 describe block)]
  modified: [server.js, lib/conversations.js, test/chat.test.js]
decisions:
  - "Read project.proposal_url (not proposal_path) per lib/projects.js line 168"
  - "Static routes inserted after /admin/admin.js block for logical grouping"
  - "API endpoints use regex match pattern consistent with existing codebase"
metrics:
  duration_seconds: 175
  completed_date: "2026-03-31T23:32:39Z"
  tasks_completed: 3
  files_modified: 3
---

# Phase 04 Plan 01: Backend Routes for Chat UI Summary

Server-side routing and helper function for chat/login static pages, proposal download, and conversation listing — enabling the frontend plans (02-03) to function.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 0 | Add Wave 0 test cases | 53db2d4 | test/chat.test.js |
| 1 | Add static routes and API endpoints | 68bc146 | server.js |
| 2 | Add getConversationsByProject | b384f9b | lib/conversations.js |

## What Was Built

**server.js** gained 7 new route blocks:
- `GET /chat` — serves `chat/chat.html` as text/html
- `GET /login` — serves `login/login.html` as text/html
- `GET /chat/chat.js` — serves `chat/chat.js` as application/javascript
- `GET /login/login.js` — serves `login/login.js` as application/javascript
- `GET /api/proposals/:id/download` — auth-required, reads `project.proposal_url`, returns DOCX with `Content-Disposition`
- `GET /api/conversations/:id/messages` — auth-required, returns message array
- `GET /api/projects/:id/conversations` — auth-required, returns conversation array

**lib/conversations.js** gained `getConversationsByProject(projectId)` — queries conversations by project_id, ordered descending by created_at.

**test/chat.test.js** gained `describe("Phase 04 endpoints")` with 4 test cases:
- GET /chat returns 200 text/html
- GET /login returns 200 text/html
- GET /api/conversations/:id/messages returns 401 without auth
- GET /api/proposals/:id/download returns 401 without auth

## Decisions Made

1. `proposal_url` field used (not `proposal_path`) — confirmed from `lib/projects.js` line 168 where `proposal_url: proposalPath` is set.
2. Static routes grouped after existing static route block (`/admin/admin.js`) for readability.
3. Test placeholder files created in `before()` hook and cleaned in `after()` hook to ensure static route tests pass without depending on plan 02-03 deliverables.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None — all routes are fully wired. The `getConversationsByProject` function returns empty array in local/mock mode (no Supabase), which is intentional and consistent with the codebase pattern.

## Self-Check: PASSED

- `server.js` contains all 7 route blocks (verified by grep)
- `lib/conversations.js` exports `getConversationsByProject` at line 55
- `test/chat.test.js` contains `describe("Phase 04 endpoints"` at line 105
- Commits 53db2d4, 68bc146, b384f9b all exist in git log
- `proposal_url` used (not `proposal_path`) — confirmed by grep returning no matches for `proposal_path`
