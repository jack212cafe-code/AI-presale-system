# Phase 2: User Authentication - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 02-user-authentication
**Areas discussed:** Session mechanism, User provisioning, Session lifetime, Project ownership migration

---

## Session mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Server-side cookie sessions | Follow existing admin-auth.js pattern. In-memory Map + HttpOnly cookie. Simple, no secret needed, easy revocation. Sessions lost on server restart. | ✓ |
| JWT tokens | Stateless, survives restarts. Bearer token or cookie. Needs JWT_SECRET, revocation requires denylist. | |
| Supabase-persisted sessions | Store tokens in user_sessions table. Survives restarts, easy revocation. More DB reads per request. | |

**User's choice:** Claude recommended — server-side cookie sessions (option 1)
**Notes:** 5 office users, simple use case. Session loss on restart acceptable. JWT adds complexity for no real benefit at this scale.

---

## User provisioning

| Option | Description | Selected |
|--------|-------------|----------|
| Seed script | scripts/seed-users.js creates initial accounts. Repeatable, proper code. | ✓ |
| Admin endpoint | POST /api/admin/users behind existing admin auth. | |
| Manual SQL | INSERT in Supabase dashboard. No code needed. | |

**User's choice:** Claude recommended — seed script
**Notes:** 5 fixed accounts rarely change. Seed script is minimal and reproducible.

---

## Session lifetime & persistence

| Option | Description | Selected |
|--------|-------------|----------|
| 7 days | Re-login once a week at most. | |
| 30 days | Essentially "stay logged in." Low friction for internal tool. | ✓ |
| 12 hours | Match existing admin-auth TTL. Re-login each workday. | |

**User's choice:** 30 days
**Notes:** Max-Age=2592000, persistent cookie satisfying M3 requirement.

---

## Project ownership migration

| Option | Description | Selected |
|--------|-------------|----------|
| Assign to first user | Migration sets user_id to user ID 1. | |
| NULL = shared | Keep user_id nullable, NULL rows visible to all. | |
| Delete existing projects | Clean slate — they're test data. | ✓ |

**User's choice:** Delete existing projects (option 3)
**Notes:** All current projects are test data. user_id will be NOT NULL after migration.

---

## Claude's Discretion

- bcrypt cost factor
- Session Map internal structure
- Session token format
- Cookie cleanup timing

## Deferred Ideas

- Admin endpoint for user management — if team grows
- Password reset flow — out of scope this milestone
- RBAC — defer to v2.0
