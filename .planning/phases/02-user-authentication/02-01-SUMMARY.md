---
phase: 02-user-authentication
plan: 01
subsystem: auth
tags: [authentication, sessions, bcrypt, users]
dependency_graph:
  requires: []
  provides: [user-session-management, login-logout-endpoints, users-table-schema]
  affects: [server.js, lib/user-auth.js]
tech_stack:
  added: [bcryptjs@^2.4.3]
  patterns: [cookie-based-sessions, in-memory-session-map, sliding-expiry]
key_files:
  created:
    - supabase/migration-02-users.sql
    - lib/user-auth.js
    - scripts/seed-users.js
    - package.json
  modified:
    - server.js
decisions:
  - "Cookie name ai_presale_session (D-02) — distinguishes from admin session cookie"
  - "30-day TTL with sliding expiry (D-04, D-05) — persistent login for team use"
  - "bcryptjs (pure JS) for Windows compatibility — no native build issues"
  - "Session Map stores userId+displayName — required for project ownership (M4)"
metrics:
  duration: "~10 minutes"
  completed: "2026-03-30"
  tasks_completed: 2
  files_created: 4
  files_modified: 1
---

# Phase 02 Plan 01: User Authentication Foundation Summary

## One-liner

Cookie-based user sessions with bcryptjs password hashing, 30-day sliding expiry, and login/logout/session API endpoints mirroring the admin-auth pattern.

## What Was Built

### Task 1: Users table migration + auth library + seed script (f8b4777)

- `supabase/migration-02-users.sql`: `users` table with `id`, `username` (unique), `password_hash`, `display_name`, `created_at`; plus `idx_users_username` index
- `lib/user-auth.js`: Session management with `ai_presale_session` cookie, 30-day TTL (Max-Age=2592000), sliding expiry on each request, stores `userId` and `displayName` in session Map. Exports all 9 required functions including `validateUserCredentials` (queries Supabase, bcrypt.compare)
- `scripts/seed-users.js`: Seeds user1–user5 with bcryptjs cost factor 12, upserts on conflict
- `package.json`: Added bcryptjs@^2.4.3 dependency, added `seed:users` script

### Task 2: Login and logout API endpoints in server.js (7d8b102)

- `POST /api/auth/login`: validates credentials via `validateUserCredentials`, creates session, returns user info + Set-Cookie header; 401 on invalid credentials
- `POST /api/auth/logout`: destroys session, clears cookie with Max-Age=0
- `GET /api/auth/session`: returns `{ authenticated, user }` — no auth required

## Decisions Made

- bcryptjs (pure JS) chosen over bcrypt (native) for Windows compatibility without build toolchain
- Session Map stores `{ userId, displayName, createdAt, expiresAt }` — displayName cached to avoid DB lookup on every request
- 30-day Max-Age matches plan D-04; sliding expiry resets on every authenticated request (D-05)

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None — `validateUserCredentials` returns null when Supabase is unavailable (local mode). Login will always return 401 in local mode. This is expected behavior, not a stub.

## Self-Check: PASSED

Files created:
- supabase/migration-02-users.sql: FOUND
- lib/user-auth.js: FOUND
- scripts/seed-users.js: FOUND
- package.json: FOUND (in worktree)

Commits:
- f8b4777: feat(02-01): add users migration, user-auth library, and seed script
- 7d8b102: feat(02-01): add login, logout, and session endpoints to server.js
