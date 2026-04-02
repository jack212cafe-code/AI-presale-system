# Phase 2: User Authentication - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Simple multi-user login for ~5 office team members. Each user has isolated project history. Covers: users table, password hashing, session management, login/logout endpoints, session middleware, and tying projects to user_id.

Creating users via seed script. No self-registration, no password reset UI, no role-based access.

</domain>

<decisions>
## Implementation Decisions

### Session mechanism
- **D-01:** Server-side cookie sessions — in-memory Map + HttpOnly cookie, following existing `lib/admin-auth.js` pattern
- **D-02:** Cookie name: `ai_presale_session` (separate from admin cookie `ai_presale_admin_session`)
- **D-03:** SameSite=Lax, HttpOnly, Path=/

### Session lifetime
- **D-04:** 30-day persistent cookie — `Max-Age=2592000` (satisfies M3 "persists across browser closes")
- **D-05:** Sliding expiry — reset TTL on each authenticated request (same pattern as admin-auth)

### Password storage
- **D-06:** bcrypt for password hashing (as specified in roadmap plan 1)

### User provisioning
- **D-07:** Seed script — `scripts/seed-users.js` creates initial accounts with hashed passwords
- **D-08:** No runtime user creation endpoint in this phase

### Project ownership migration
- **D-09:** Delete all existing projects on migration — they are test data, clean slate
- **D-10:** `user_id` foreign key on projects table is NOT NULL after migration

### Claude's Discretion
- Exact bcrypt cost factor (recommend 12)
- In-memory session Map structure (token → {userId, expiresAt})
- Exact cookie cleanup / expiry check timing
- Session token format (randomUUID is fine)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing auth pattern
- `lib/admin-auth.js` — In-memory session Map, cookie helpers, cleanup pattern — replicate this structure for user auth

### Requirements
- `.planning/REQUIREMENTS.md` §M3 — Login + session persistence requirement
- `.planning/REQUIREMENTS.md` §M4 — Cross-session project history requirement

### Project decisions
- `.planning/STATE.md` — Decisions log (keep Node.js raw http, no framework)

No external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/admin-auth.js`: `parseCookieHeader`, `cleanupExpiredSessions`, `buildSessionCookie`, `buildExpiredSessionCookie` — copy/adapt these helpers for user sessions
- `lib/supabase.js`: Supabase client — use for users table queries
- `lib/config.js`: Config loader — add any new env vars here

### Established Patterns
- Cookie-based sessions: HttpOnly, SameSite=Lax, sliding TTL — already established in admin-auth
- ESM modules: all new files use `import/export`
- Raw Node.js HTTP: no Express/Fastify — middleware is manual (check auth in route handler or shared helper)

### Integration Points
- `server.js` route table — add `POST /api/auth/login`, `POST /api/auth/logout`, session middleware
- projects table in Supabase — add `user_id` column, update all project queries to filter by session user
- Existing `/api/pipeline` and `/api/projects/:id/status` — wrap with auth middleware

</code_context>

<specifics>
## Specific Ideas

- Follow `lib/admin-auth.js` closely — same cookie pattern, same session Map structure, just per-user instead of single admin
- Keep it minimal: login endpoint, logout endpoint, session check middleware — no extra complexity

</specifics>

<deferred>
## Deferred Ideas

- Admin endpoint for adding/removing users — add to backlog if team grows
- Password reset flow — out of scope for this milestone
- Role-based access control — defer to v2.0

</deferred>

---

*Phase: 02-user-authentication*
*Context gathered: 2026-03-29*
