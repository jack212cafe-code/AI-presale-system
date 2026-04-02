# Testing Patterns

**Analysis Date:** 2026-03-29

## Test Framework

**Runner:**
- Node.js built-in `node:test` (no third-party runner)
- Config: none — runner is invoked directly via npm script

**Assertion Library:**
- `node:assert/strict` (strict equality mode throughout)

**Run Commands:**
```bash
npm test              # Run all tests (--test-isolation=none)
npm run check         # Alias for test
```

Flag `--test-isolation=none` means all tests share a single module cache. This is intentional: `AI_PRESALE_FORCE_LOCAL=1` is set at the top of the test file before any agent imports, ensuring mock mode is active for every import in the same process.

## Test File Organization

**Location:**
- Single test file: `test/scaffold.test.js`
- No co-located test files next to source modules

**Fixture files:**
- `test/fixtures/scenario_hci.json`
- `test/fixtures/scenario_dr.json`
- `test/fixtures/scenario_backup.json`
- `test/fixtures/scenario_multi_agent_saas.json`
- `test/fixtures/scenario_incomplete_brief.json`
- `test/fixtures/scenario_conflicting_brief.json`

**Fixture loading helper** (lines 31–34):
```js
async function loadFixture(name) {
  const filePath = path.join(__dirname, "fixtures", name);
  return JSON.parse(await readFile(filePath, "utf8"));
}
```

## Test Structure

All 17 tests are flat top-level `test(description, async () => { ... })` blocks. No nested `describe`/`suite` grouping is used.

**Pattern:**
```js
test("description of expected behavior", async () => {
  // arrange: load fixture or construct input inline
  // act: call function under test
  // assert: assert.equal / assert.ok / assert.deepEqual
});
```

No `beforeEach`, `afterEach`, or shared setup hooks. Tests that spin up an HTTP server always close it in a `finally` block:
```js
const server = createAppServer();
server.listen(0, "127.0.0.1");
await once(server, "listening");
try {
  // test body
} finally {
  server.close();
}
```
Port `0` is used to get a random free port, avoiding port conflicts between server tests.

## What Is Covered

**Knowledge base:**
- Seed entries are valid and have required metadata (`test/scaffold.test.js` line 36)
- `chunkText` and `inferMetadata` helpers produce expected output (line 61)
- Raw document importer validates files and writes a manifest (line 78)

**Intake layer:**
- `normalizeIntakePayload` trims and maps fields correctly (line 44)
- HTTP POST `/api/intake` accepts valid minimal payload, returns `{ ok: true, mode: "local" }` (line 195)
- HTTP POST `/api/intake` rejects missing `partner_type` with `400` and actionable error string (line 231)
- HTTP POST `/api/intake` rejects empty body with `400` (line 353)
- HTTP POST `/api/intake/analyze` runs discovery inline and returns `requirements` (line 264)

**Agent pipeline (local/mock mode):**
- `discovery → solution → bom` chain produces valid outputs for `scenario_hci.json` (line 151)
- Discovery correctly reflects SaaS objective from `scenario_multi_agent_saas.json` (line 163)
- Proposal agent writes a valid `.docx` file (PK magic bytes) for `scenario_dr.json` (line 176)
- Discovery surfaces gaps and next questions for `scenario_incomplete_brief.json` (line 300)
- Discovery surfaces `workflow_blockers` for `scenario_conflicting_brief.json` (line 310)
- Solution agent always returns `retrieval_mode` field (line 320)
- BOM agent derives quantity from `node_count` in scale when hardware vendor is present (line 329)

**Admin layer:**
- `normalizeKnowledgeUploadPayload` and `normalizeKnowledgeDeletePayload` (line 121)
- `validateAdminPassword`, `createAdminSession`, `buildAdminSessionCookie`, `isAuthenticatedAdminRequest` (line 137)

**HTTP API error paths:**
- `/api/solution` returns `400` when `project_id` is missing (line 377)
- `/api/projects/:id/approve` returns `404` for unknown project in local mode (line 401)

## What Is Not Covered

**No coverage for:**
- `agents/proposal.js` approval gate (`human_approved` check) — tested indirectly only; no test asserts the `403`/error when `human_approved = false` with a real `projectId`
- `lib/json.js` `safeParseJson` unit tests — no direct tests for the fallback regex and bracket-walking paths
- `lib/supabase.js` — all Supabase calls are bypassed in local mode; no integration tests
- `lib/projects.js` — `persistSolutionJson`, `persistBomJson`, `persistProposalMetadata` not exercised in tests
- `lib/admin-jobs.js` — not imported or tested
- `knowledge_base/embed.js` (seed embedding script) — not tested
- `scripts/smoke.js` — separate smoke script, not part of `npm test`
- Full pipeline scenario for `scenario_backup.json` — fixture exists but no test uses it
- Proposal agent `next_steps` field — `buildMockDraft` does not include `next_steps`, yet validation requires `proposal.sections` not `next_steps`; mismatch is untested

## Fixture Purpose

| Fixture | Purpose |
|---|---|
| `scenario_hci.json` | Well-specified HCI + backup with numeric scale; primary happy-path fixture |
| `scenario_dr.json` | DR-focused with urgent timeline; used for proposal agent test |
| `scenario_backup.json` | Backup modernization focus (Finance); no test currently uses it |
| `scenario_multi_agent_saas.json` | SaaS/partner platform; tests that agent reflects project objective correctly |
| `scenario_incomplete_brief.json` | Missing scale and budget; tests gap detection and next-question generation |
| `scenario_conflicting_brief.json` | Contradictory requirements (low cost + enterprise grade); tests `workflow_blockers` |

## Known Gaps in Test Coverage

**High priority:**
- `scenario_backup.json` fixture is defined but no test uses it — the CLAUDE.md-required "HCI + Backup" scenario is partially covered via `scenario_hci.json` but the backup-only scenario is untested
- `safeParseJson` fallback paths (regex extraction and `findBalancedJson`) have no unit tests; these are the LLM output resilience paths most likely to fail silently in production
- Approval gate in `runProposalAgent` (`human_approved` check) is not tested; this is a critical business rule per `CLAUDE.md`

**Medium priority:**
- No test asserts `agent_logs` entries are written (logging side-effect)
- No test covers `lib/projects.js` persistence functions in live mode
- `/api/intake/analyze` test uses inline payload, not a fixture — inconsistent with the rest of the suite

**Low priority:**
- `scenario_backup.json` needs a corresponding test block
- Admin portal password-less state (empty `ADMIN_PORTAL_PASSWORD`) is not tested

---

*Testing analysis: 2026-03-29*
