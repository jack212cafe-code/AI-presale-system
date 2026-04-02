# Codebase Concerns

**Analysis Date:** 2026-03-29

---

## Security Issues

**Unauthenticated approve endpoint:**
- Issue: `POST /api/projects/:id/approve` in `server.js` (line 198–211) sets `human_approved = true` with no authentication check. Any caller with network access can approve any project.
- Files: `server.js`, `lib/projects.js`
- Impact: The human-approval gate — the only delivery safeguard — can be bypassed trivially.
- Fix approach: Add `requireAdminAuth` guard to the approve route, same pattern as `/api/admin/kb/*`.

**Admin sessions stored in process memory only:**
- Issue: `lib/admin-auth.js` stores sessions in a `Map()` (line 7). Server restart clears all sessions. No session persistence, no revocation list beyond in-process cleanup.
- Files: `lib/admin-auth.js`
- Impact: Sessions silently die on restart/deploy. In multi-process or clustered deployment all sessions break.
- Fix approach: Move session store to Supabase or use signed JWT with short TTL.

**Admin cookie missing `Secure` flag:**
- Issue: `buildAdminSessionCookie` in `lib/admin-auth.js` (line 89) sets `HttpOnly; SameSite=Lax` but not `Secure`. Cookie will be sent over plain HTTP.
- Files: `lib/admin-auth.js`
- Impact: Session token exposed on non-HTTPS connections.
- Fix approach: Append `; Secure` when `NODE_ENV=production` or when `config.publicBaseUrl` uses `https:`.

**Path traversal risk in document delete:**
- Issue: `deleteRawDocumentFiles` in `knowledge_base/raw-import-lib.js` (line 225–236) blocks `..` but does not validate that the resolved path stays inside `rawDir`. A `relativePath` with encoded sequences or symlinks could escape.
- Files: `knowledge_base/raw-import-lib.js`
- Impact: Admin-authenticated attacker could delete arbitrary files accessible to the Node process.
- Fix approach: After resolving `absolutePath`, assert `absolutePath.startsWith(rawDir)` before calling `rm`.

**`collectRawCandidateFiles` trusts `sourceFiles` array without containment check:**
- Issue: `knowledge_base/raw-import-lib.js` (line 304–324) maps raw strings to absolute paths by joining with `rawDir`, but no check asserts the resulting path is inside `rawDir`. Combined with the import flow, a crafted `source_file` value could point outside the KB directory.
- Files: `knowledge_base/raw-import-lib.js`
- Impact: Arbitrary file read via the import pipeline if source_file is controlled.
- Fix approach: Assert each resolved path starts with `rawDir` before processing.

**No rate limiting on intake or admin endpoints:**
- Issue: `server.js` has no request rate limiting on `POST /api/intake`, `POST /api/intake/analyze`, or `POST /api/admin/login`. Each intake/analyze call triggers live OpenAI API calls.
- Files: `server.js`
- Impact: Cost amplification attack (unlimited OpenAI spend) and brute-force of admin password.
- Fix approach: Add per-IP rate limiting middleware; limit `/api/admin/login` to ≤5 attempts per minute.

**`parseBody` does not enforce a size limit:**
- Issue: `parseBody` in `server.js` (line 49–60) concatenates all chunks without a maximum body size check.
- Files: `server.js`
- Impact: A large POST body (e.g., base64 document upload) can exhaust process memory.
- Fix approach: Reject requests when accumulated chunk size exceeds a configured limit (e.g., `config.knowledgeImport.maxFileSizeMb * 1.4`).

---

## Human-Approval Gate Incomplete

**`human_approved` gate is checked after LLM generation, not before:**
- Issue: `agents/proposal.js` (line 91–97) runs the full OpenAI proposal generation call first, then checks `human_approved`. If the flag is false the error is thrown but API cost has already been incurred.
- Files: `agents/proposal.js`, `lib/projects.js`
- Impact: Every unapproved call wastes one LLM invocation and associated token cost.
- Fix approach: Fetch and check `human_approved` before calling `generateJsonWithOpenAI`.

**`persistProposalMetadata` resets `human_approved` to false:**
- Issue: `lib/projects.js` (line 148) writes `human_approved: false` when persisting proposal metadata. If a project was already approved and a proposal is re-generated, the approval is revoked silently.
- Files: `lib/projects.js`
- Impact: Approved projects can lose their approval status on any proposal re-run.
- Fix approach: Remove `human_approved: false` from `persistProposalMetadata`; approval state should only be set by `approveProject`.

**No n8n / Line notification wired for approval flow:**
- Issue: TASK_TRACKER Phase 7 (status: In Progress) confirms the webhook/Line review workflow is not implemented. Approval is only available via direct API call.
- Files: `server.js`, `n8n/workflow.json` (starter skeleton only)
- Impact: No real human review process exists. The gate can only be triggered by technical users who know the API.
- Fix approach: Implement Phase 8 — wire n8n approval wait-step and owner notification.

---

## Incomplete / Stubbed Pipeline Steps

**`/api/solution` does not persist `solution_json` through the HTTP route:**
- Issue: `agents/solution.js` calls `persistSolutionJson` only when `options.projectId` is provided. The route in `server.js` (line 176–196) passes `{ projectId: project.id }`, so persistence should work, but TASK_TRACKER Phase 5 Execute marks "Persist `solution_json`" as Not Started — indicating it has not been validated end-to-end.
- Files: `server.js`, `agents/solution.js`, `lib/projects.js`
- Impact: Solution data may not reliably land in `projects.solution_json` before BOM/proposal agents consume it.

**BOM and proposal have no HTTP routes in `server.js`:**
- Issue: There is no `POST /api/bom` or `POST /api/proposal` route in `server.js`. BOM and proposal agents can only be triggered via the smoke test or direct script invocation.
- Files: `server.js`, `agents/bom.js`, `agents/proposal.js`
- Impact: The pipeline cannot be driven end-to-end via the API. n8n cannot call BOM or proposal steps.

**`n8n/workflow.json` is a starter skeleton:**
- Issue: TASK_TRACKER Phase 8 is Not Started. The workflow file has no real nodes, no intake trigger, no agent execution steps, and no review wait-step.
- Files: `n8n/workflow.json`
- Impact: The orchestrator layer does not exist. The full pipeline cannot run autonomously.

**No tests for approved/blocked delivery states:**
- Issue: TASK_TRACKER Phase 7 Execute explicitly marks these tests as Not Started.
- Files: `agents/proposal.js`, `test/`
- Impact: The approval gate is untested. Regressions will not be caught.

**No tests for missing KB and conflicting KB cases in solution agent:**
- Issue: TASK_TRACKER Phase 5 Execute marks these tests as Not Started.
- Files: `agents/solution.js`, `test/`
- Impact: Edge-case retrieval failures are undetected in CI.

**Solution output schema and selection logic not frozen:**
- Issue: TASK_TRACKER Phase 5 Plan items "Freeze solution output schema" and "Define recommendation quality acceptance criteria" are Not Started.
- Files: `agents/solution.js`, `agents/_prompts/solution.md`
- Impact: Downstream agents (BOM, proposal) consume an unstable solution schema. Any schema change silently breaks downstream.

---

## Technical Debt

**Fallback pricing catalog hard-coded in `agents/bom.js`:**
- Issue: `agents/bom.js` (line 15–19) contains three hard-coded fallback rows (Nutanix NX-HCI-BASE, Veeam Enterprise, Dell 3-Tier). These prices are stale placeholders.
- Files: `agents/bom.js`
- Impact: When Supabase pricing lookup returns no matches, the BOM silently uses mock prices without surfacing this as an error, producing a proposal with wrong pricing.
- Fix approach: Emit a structured warning or throw when fallback is used in production mode; remove hard-coded rows after pricing catalog is validated.

**BOM `subtotal` is not verified against sum of `rows`:**
- Issue: `sanitizeBomOutput` in `agents/bom.js` (line 110–125) accepts LLM-supplied `subtotal` without cross-checking against the actual row sum. If the model miscalculates, the document will show incorrect totals.
- Files: `agents/bom.js`
- Impact: Proposal documents may contain arithmetically wrong subtotals.
- Fix approach: Always recompute `subtotal = rows.reduce(...)` and discard the LLM-supplied value.

**`deriveQty` defaults to 3 nodes for all hardware vendors regardless of requirements:**
- Issue: `agents/bom.js` (line 62–68) uses `DEFAULT_NODE_COUNT = 3` when scale data is missing. This is a silent assumption that will inflate or deflate BOMs for non-3-node deployments.
- Files: `agents/bom.js`
- Impact: BOM quantities wrong for single-node POC or large-scale deployments.

**`proposal_url` stores a local filesystem path, not a URL:**
- Issue: `agents/proposal.js` (line 102–105) constructs a local `output/` path and persists it as `proposal_url` in Supabase. This is not a retrievable URL.
- Files: `agents/proposal.js`, `lib/projects.js`
- Impact: `proposal_url` field in the database is not usable by n8n, Line notifications, or any other system that needs to fetch the document.
- Fix approach: Upload the generated `.docx` to Supabase Storage or another accessible store and persist the public URL.

**`next_steps` field omitted from mock proposal draft:**
- Issue: `buildMockDraft` in `agents/proposal.js` (line 43–54) does not include `next_steps`, but `proposalTextFormat` schema requires it. If mock mode is used the sanitization step produces an empty `next_steps` array silently.
- Files: `agents/proposal.js`

**Environment separation strategy not defined:**
- Issue: TASK_TRACKER Phase 1 Research marks "Confirm environment separation strategy: local, staging, production" as Not Started.
- Impact: There is no staging environment. All testing hits production Supabase and OpenAI. A bad run will corrupt production data.

**`gpt-5-mini` model references may not be valid:**
- Issue: TASK_TRACKER notes "Runtime defaults set to `gpt-5-mini` for all agents." This model name was not a published OpenAI model as of the knowledge cutoff. If the model string is wrong, all agent calls will fail at runtime.
- Files: `lib/config.js` (model config), all agent files
- Impact: Complete pipeline failure if model name is rejected by the OpenAI API.

---

## Performance Concerns

**Serial embedding in `knowledge_base/embed.js` seed flow:**
- Issue: The seed embed script processes documents one at a time (or in small batches). With 36+ documents and growing KB, re-embedding the full seed is slow.
- Files: `knowledge_base/embed.js`, `knowledge_base/raw-import-lib.js`
- Impact: KB refresh cycles take minutes; no incremental-only mode exists.

**No response caching for vector retrieval:**
- Issue: Every call to `runSolutionAgent` issues a live OpenAI embedding call plus a Supabase vector search. Identical queries (same requirements object) always hit the network.
- Files: `agents/solution.js`
- Impact: Repeated runs of the same project cost additional tokens and add latency. In smoke/test scenarios this causes unnecessary API spend.

**Proposal generation token budget not bounded:**
- Issue: `agents/proposal.js` does not pass `maxOutputTokens` to `generateJsonWithOpenAI`. The solution agent uses 5000 (`agents/solution.js` line 179). Unbounded output increases cost and latency risk.
- Files: `agents/proposal.js`

**All file reads in `extractTextFromFile` are synchronous-style one-shot loads:**
- Issue: `knowledge_base/raw-import-lib.js` reads entire file content into memory before chunking. Large PDFs or XLSX files approaching the `maxFileSizeMb` limit will spike memory usage.
- Files: `knowledge_base/raw-import-lib.js`

---

## Pricing Data Gaps

**Only 25 pricing rows seeded; no real vendor quotes:**
- Issue: `scripts/seed-pricing.js` inserts 25 items across 5 vendors (Nutanix, Veeam, Dell, Cisco, Fortinet, HPE). Prices are illustrative estimates in THB with no source citation, no effective date, and no expiry tracking.
- Files: `scripts/seed-pricing.js`
- Impact: BOMs generated from this catalog will not match real vendor quotes. Proposals sent to customers with unapproved pricing create commercial risk.

**No pricing freshness / stale-price tracking:**
- Issue: `pricing_catalog` schema has no `valid_until`, `effective_date`, or `source` column. TASK_TRACKER Phase 6 marks pricing refresh cadence as Not Started.
- Impact: Stale pricing will be used silently with no warning.

**Missing vendors in pricing catalog:**
- Issue: Cisco Secure (Umbrella, Duo), Veeam M365 per-user row is present but there are no rows for: Pure Storage, Hitachi VSP, Microsoft Azure local, VMware (Broadcom), Zerto, or any cybersecurity SaaS products.
- Impact: BOM falls back to hard-coded `${vendor}-GEN` placeholder rows for any unlisted vendor, producing a meaningless line item.

---

## KB Coverage Gaps

**Real-world project evidence absent:**
- Issue: TASK_TRACKER Phase 2 Evaluate: "still needs real pricing depth, anonymized project evidence, and more partner-specific pain-point examples."
- Files: `knowledge_base/seed/`
- Impact: RAG retrieval returns generic guidance rather than validated real-world sizing. Solution quality is limited by seed-only knowledge.

**KB category coverage not balanced:**
- Issue: Seed covers expert domain notes, vendor guides, and SaaS strategy but TASK_TRACKER confirms cybersecurity-specific KB and partner workflow specifics are still weak.
- Impact: Solution agent generates weaker recommendations for cybersecurity-only or hybrid scenarios.

---

## Phase 5–9 Gaps Summary

**Phase 5 (Solution Design) — In Progress:**
- Retrieval metadata filtering approach: Not Started
- Solution output schema frozen: Not Started
- Recommendation quality acceptance criteria: Not Started
- Tests for missing/conflicting KB: Not Started
- Owner cannot yet distinguish primary vs alternative solution clearly: Not Started

**Phase 6 (BOM and Pricing) — In Progress:**
- BOM rounding/floating rules: Not Started
- Pricing import and maintenance process: Not Started
- Stale-price and missing-price handling: Not Started
- BOM comparison tests vs manual: Not Started
- `bom_json` persistence validation: Not Started

**Phase 7 (Proposal) — In Progress:**
- Human review webhook/Line workflow: Not wired
- Tests for approved/blocked delivery: Not Started
- Proposal output style alignment: In Progress (not complete)
- Review gate bypass prevention: Not tested

**Phase 8 (n8n Orchestration) — Not Started:**
- All tasks: Not Started
- No end-to-end workflow exists

**Phase 9 (QA / Production Readiness) — Not Started:**
- All tasks: Not Started
- No go-live checklist
- No monitoring or alerting
- No incident/rollback process
- Cost and reliability targets undefined

---

*Concerns audit: 2026-03-29*
