---
phase: 02-user-authentication
plan: 02
subsystem: auth
tags: [authentication, middleware, routes, projects, user-scoped]
dependency_graph:
  requires: [02-01]
  provides: [protected-api-routes, user-scoped-projects, project-list-endpoint]
  affects: [server.js, lib/projects.js, lib/user-auth.js, test/auth.test.js, test/pipeline.test.js]
tech_stack:
  added: []
  patterns: [requireUserAuth-middleware, user-scoped-queries, cookie-auth-guard]
key_files:
  created:
    - supabase/migration-02-projects-user-id.sql
    - test/auth.test.js
    - lib/user-auth.js
  modified:
    - lib/projects.js
    - server.js
    - test/pipeline.test.js
decisions:
  - "requireUserAuth mirrors requireAdminAuth pattern for consistency"
  - "pipeline.test.js updated with auth cookie (Rule 1 fix — routes now require session)"
metrics:
  duration: "~15 minutes"
  completed: "2026-03-30"
  tasks_completed: 2
  files_created: 3
  files_modified: 3
---

# Phase 02 Plan 02: Auth Middleware and User-Scoped Projects Summary

## One-liner

Auth middleware added to all API routes, projects tied to user_id via NOT NULL FK, and GET /api/projects returns user-scoped list; 6 new auth tests + pipeline tests updated.

## What Was Built

### Task 1: Project ownership migration + update projects.js (497d897)

- `supabase/migration-02-projects-user-id.sql`: Deletes all test data (agent_logs and projects), adds `user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE`, creates `idx_projects_user_id` index
- `lib/projects.js`: `createProjectRecord(intake, userId)` now accepts `userId` and includes `user_id` in insert; new export `listProjectsByUser(userId)` queries projects filtered by user_id ordered by created_at DESC

### Task 2: Auth middleware on routes + project list endpoint + tests (9818409)

- `lib/user-auth.js`: Added to worktree (from Plan 01 branch — foundation for auth middleware)
- `server.js`: Added `requireUserAuth(request, response)` helper; added `isAuthenticatedUserRequest` and `getSessionUserId` to user-auth imports; added `listProjectsByUser` to projects imports; protected POST /api/pipeline, /api/intake, /api/intake/analyze, /api/solution, /api/projects/:id/approve, GET /api/projects/:id/status with `requireUserAuth`; new `GET /api/projects` endpoint returning user's project list
- `test/auth.test.js`: 6 tests: login without credentials returns 401, session without cookie returns authenticated:false, session with valid cookie returns authenticated:true + displayName, pipeline without auth returns 401, /api/projects without auth returns 401, /api/projects/:id/status without auth returns 401
- `test/pipeline.test.js`: Updated to pass auth cookie in all protected route calls

## Decisions Made

- `requireUserAuth` placed adjacent to `requireAdminAuth` for consistency with existing pattern
- `GET /api/projects` placed before `GET /api/projects/:id/status` to avoid route conflict

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated pipeline.test.js to include auth session cookie**
- **Found during:** Task 2 verification
- **Issue:** Pipeline tests make unauthenticated requests to routes now guarded by requireUserAuth, causing 401 instead of expected 201/404
- **Fix:** Added `createUserSession` + `buildUserSessionCookie` import and auth cookie to all protected fetch calls in pipeline.test.js
- **Files modified:** test/pipeline.test.js
- **Commit:** 9818409

## Known Stubs

None — all routes implemented, listProjectsByUser returns empty array in local mode (expected, no stub).

## Self-Check: PASSED

Files created:
- supabase/migration-02-projects-user-id.sql: FOUND
- test/auth.test.js: FOUND
- lib/user-auth.js: FOUND

Files modified:
- lib/projects.js: FOUND
- server.js: FOUND
- test/pipeline.test.js: FOUND

Commits:
- 497d897: feat(02-02): add user_id FK migration and update projects.js
- 9818409: feat(02-02): add requireUserAuth middleware, protect routes, GET /api/projects, auth tests
