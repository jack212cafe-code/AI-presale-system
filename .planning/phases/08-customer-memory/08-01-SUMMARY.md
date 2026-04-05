---
phase: 08-customer-memory
plan: 01
subsystem: database
tags: [supabase, postgres, jsonb, vendor-preferences, customer-memory]

requires:
  - phase: 07-discovery-agent-classifier
    provides: project structure and discovery data used for customer lookup

provides:
  - user_preferences table DDL (supabase/migrations/08_user_preferences.sql)
  - lib/user-preferences.js with getVendorPreferences, upsertVendorPreference
  - lib/projects.js exports: updateProjectName, listProjectsByCustomerName, getRejectedOptionsByCustomer
  - test/unit/memory.test.js: 8 tests covering null-client fallbacks and extraction logic

affects: [08-02, chat-backend, server.js]

tech-stack:
  added: []
  patterns:
    - "Null-client guard: all lib functions return safe fallback values when Supabase client unavailable"
    - "ilike pattern for case-insensitive customer name matching"
    - "jsonb column with structured default for vendor preferences"

key-files:
  created:
    - supabase/migrations/08_user_preferences.sql
    - lib/user-preferences.js
    - test/unit/memory.test.js
  modified:
    - lib/projects.js

key-decisions:
  - "user_id in user_preferences is text NOT uuid — matches existing auth pattern where user_id is stored as text"
  - "vendor_preferences stored as jsonb { preferred: [], disliked: [] } — flexible structure for future vendor list expansion"
  - "getRejectedOptionsByCustomer queries last 3 completed projects to limit dataset size"
  - "listProjectsByCustomerName caps at 5 results to prevent flooding the chat context"

patterns-established:
  - "Null-client guard pattern: if (!client) return <safe-default> — consistent across all 5 new functions"
  - "Logic-extraction tests: pure-logic tests inline in test file without Supabase dependency"

requirements-completed: [MEM-01, MEM-02, MEM-03, MEM-04]

duration: 8min
completed: 2026-04-05
---

# Phase 08 Plan 01: Customer Memory Data Layer Summary

**Supabase user_preferences table + 5 new lib functions for vendor preference CRUD and customer project lookup, all with null-client fallbacks and 8 passing unit tests**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-05T06:52:00Z
- **Completed:** 2026-04-05T07:00:55Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Created `supabase/migrations/08_user_preferences.sql` with user_preferences table (jsonb vendor preferences, text user_id, unique constraint + index)
- Created `lib/user-preferences.js` with `getVendorPreferences` and `upsertVendorPreference` — opposite-list removal logic included
- Added 3 new exports to `lib/projects.js`: `updateProjectName`, `listProjectsByCustomerName` (ilike), `getRejectedOptionsByCustomer` (extracts non-selected options from solution_json)
- All 5 functions verified importable; 8 unit tests passing (null-client + extraction logic)

## Task Commits

1. **Task 1: Create user_preferences schema + lib/user-preferences.js + new exports in lib/projects.js** - `c1fa51b` (feat)
2. **Task 2: Unit tests for all memory lib functions** - `1fef587` (test)

## Files Created/Modified

- `supabase/migrations/08_user_preferences.sql` - user_preferences table DDL
- `lib/user-preferences.js` - getVendorPreferences, upsertVendorPreference
- `lib/projects.js` - added updateProjectName, listProjectsByCustomerName, getRejectedOptionsByCustomer
- `test/unit/memory.test.js` - 8 tests: 5 null-client + 2 extraction logic + 1 opposite-list removal

## Decisions Made

- user_id stored as text (not uuid) to match existing auth pattern
- vendor_preferences as jsonb `{ preferred: [], disliked: [] }` for flexible vendor list extension
- getRejectedOptionsByCustomer limits to last 3 completed projects to bound dataset
- listProjectsByCustomerName caps at 5 results

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None — all functions are fully implemented. Supabase integration requires executing the migration SQL against a live Supabase project (manual step for operator).

## User Setup Required

**Execute migration SQL in Supabase dashboard or CLI:**
```sql
-- Run: supabase/migrations/08_user_preferences.sql
CREATE TABLE IF NOT EXISTS user_preferences ( ... );
```

## Next Phase Readiness

- All 5 data layer functions ready for Plan 02 (chat integration)
- Plan 02 will wire `listProjectsByCustomerName` into chat greeting and `upsertVendorPreference` into a `/api/preferences` endpoint
- No blockers

## Self-Check: PASSED

- `lib/user-preferences.js` exists and exports verified
- `lib/projects.js` exports updateProjectName, listProjectsByCustomerName, getRejectedOptionsByCustomer — verified
- `supabase/migrations/08_user_preferences.sql` exists with CREATE TABLE
- `test/unit/memory.test.js` — 8/8 tests pass
- Commits c1fa51b and 1fef587 confirmed in git log

---
*Phase: 08-customer-memory*
*Completed: 2026-04-05*
