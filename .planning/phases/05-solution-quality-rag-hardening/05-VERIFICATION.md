---
phase: 05-solution-quality-rag-hardening
verified: 2026-04-02T00:00:00Z
status: human_needed
score: 11/12 must-haves verified
human_verification:
  - test: "Run `node scripts/validate-bom-scenarios.js` and review all 5 scenario BOM tables. Open output/k-edge-networks-proposal.docx and confirm it is professionally formatted."
    expected: "All 5 scenarios produce usable BOM tables. DOCX has proper headings, spacing, fonts. Thai text (if any) renders without encoding issues. Document is directly usable for customer presentation without manual cleanup."
    why_human: "M5 acceptance requires 3 presale engineers confirm output is 'usable without major edits'. DOCX visual/formatting quality and Thai text rendering cannot be verified programmatically. 05-03 Task 2 (checkpoint:human-verify, gate=blocking) was not completed — paused pending this review."
---

# Phase 05: Solution Quality & RAG Hardening Verification Report

**Phase Goal:** Improve solution quality — per-use-case RAG retrieval, Thai enterprise prompts, and human-validated BOM output
**Verified:** 2026-04-02
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | getKnowledge runs one embedding call per use_case | VERIFIED | `_getKnowledgeWithDeps` uses `Promise.allSettled(useCases.map(async (useCase) => { const embedding = await embedQueryFn(useCase); ... }))` — one call per element |
| 2 | Results are deduplicated by chunk ID, keeping highest similarity | VERIFIED | `Map<chunk.id, chunk>` with `if (!existing || chunk.similarity > existing.similarity)` in solution.js:82-87 |
| 3 | Final chunk count capped at 5 | VERIFIED | `.slice(0, 5)` at solution.js:91 (vector) and solution.js:111 (local) |
| 4 | Local fallback deduplicates by source_key | VERIFIED | `Map<chunk.source_key, chunk>` in solution.js:102-107 |
| 5 | retrieval_mode field present in solution output | VERIFIED | `return { chunks, retrieval_mode: "vector" }` and `return { chunks, retrieval_mode: "local_fallback" }` |
| 6 | Unit test confirms per-use-case retrieval, dedup, top-5, fallback | VERIFIED | 5/5 tests pass: `node --test test/unit/getKnowledge.test.js` — all green |
| 7 | Unit test asserts retrieval_mode presence | PARTIAL | Test 4 asserts `retrieval_mode === "local_fallback"`, Test 5 asserts same. Test 1 does NOT assert `retrieval_mode === "vector"` — plan said "Unit test confirms... retrieval_mode presence" but vector-path retrieval_mode is not explicitly asserted |
| 8 | Solution prompt frames agent as IT presale for Thai enterprise | VERIFIED | Line 1: "You are a Solution Design Agent for IT infrastructure presale serving Thai enterprise customers." No "SaaS" anywhere |
| 9 | Solution prompt names all 5 domains and 6 vendors | VERIFIED | HCI, 3-Tier, Backup & Recovery, DR, Cybersecurity present. Nutanix, Veeam, Dell, Cisco, Fortinet, HPE all present |
| 10 | Proposal prompt instructs all output in Thai | VERIFIED | Line 3: "All field values MUST be written in Thai (ภาษาไทย)" at top of file. ภาษาทางการ present |
| 11 | Proposal prompt provides field-level guidance for all 4 fields | VERIFIED | executive_summary, solution_overview, assumptions, next_steps all have detailed guidance including ฝ่ายขาย/วิศวกร/ลูกค้า prefixes |
| 12 | BOM validation script runs 5 scenarios with catalog match checking | VERIFIED | `scripts/validate-bom-scenarios.js` exists with KNOWN_SKUS Set (25 SKUs), all 5 scenarios, `KNOWN_SKUS.has()` check, `NOT IN CATALOG` flag |

**Score:** 11/12 truths verified (1 minor gap: vector-path retrieval_mode not asserted in Test 1)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `agents/solution.js` | Per-use-case retrieval in getKnowledge | VERIFIED | Contains `Promise.allSettled`, `useCases.map`, Map dedup by chunk.id and source_key, `.slice(0, 5)` |
| `test/fixtures/scenario_cybersecurity.json` | Cybersecurity BOM scenario fixture | VERIFIED | 15 keys, customer "SecureBank Corp", notes contain "NGFW" |
| `test/fixtures/scenario_fullstack.json` | Full-stack BOM scenario fixture | VERIFIED | 15 keys, customer "TotalTech Enterprise", notes contain "HCI", "DR", "NGFW" |
| `test/unit/getKnowledge.test.js` | Unit tests for getKnowledge behavior | VERIFIED | 5 tests, all passing. Imports `_getKnowledgeWithDeps` (documented deviation from plan — uses extracted helper instead of `deps` param on `getKnowledge`) |
| `agents/_prompts/solution.md` | Thai enterprise IT presale prompt | VERIFIED | 51 lines, no SaaS references, all 6 vendors, all 5 domains, "Do NOT add fields" schema warning, "knowledge base" grounding instruction |
| `agents/_prompts/proposal.md` | Thai enterprise proposal prompt with field guidance | VERIFIED | 35 lines (expanded from 7-line stub), Thai instruction at top, all 4 fields with guidance |
| `scripts/validate-bom-scenarios.js` | BOM validation across 5 presale scenarios | VERIFIED | KNOWN_SKUS Set with 25 entries, 5 scenarios, runSolutionAgent + runBomAgent calls, per-scenario try/catch |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `agents/solution.js` | `lib/openai.js` | embedQuery called per use_case | WIRED | `embedQueryFn(useCase)` in per-use-case map; production `getKnowledge` wires real `embedQuery` |
| `agents/solution.js` | `lib/supabase.js` | retrieveKnowledgeFromVector per use_case | WIRED | `retrieveVectorFn(embedding, 5)` per use_case; production `getKnowledge` wires real fn |
| `agents/solution.js` | `agents/_prompts/solution.md` | loadPrompt reads solution.md | WIRED | `readFile(path.join(__dirname, "_prompts", "solution.md"), "utf8")` at line 18 |
| `agents/proposal.js` | `agents/_prompts/proposal.md` | loadPrompt reads proposal.md | WIRED | `readFile(path.join(__dirname, "_prompts", "proposal.md"), "utf8")` at line 17 |
| `scripts/validate-bom-scenarios.js` | `agents/solution.js` | calls runSolutionAgent per scenario | WIRED | `import { runSolutionAgent } from "../agents/solution.js"`, called in main loop |
| `scripts/validate-bom-scenarios.js` | `agents/bom.js` | calls runBomAgent with solution output | WIRED | `import { runBomAgent } from "../agents/bom.js"`, called with solution result |
| `scripts/validate-bom-scenarios.js` | `test/fixtures/` | loads 5 scenario fixture files | WIRED | `scenario_` pattern, fixture files loaded via `readFile(fixturePath, "utf8")` |

### Data-Flow Trace (Level 4)

Not applicable for this phase. All deliverables are prompt files, a test script, and a CLI validation script — not UI components rendering dynamic data from a DB.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Unit tests pass (5/5) | `node --test test/unit/getKnowledge.test.js` | 5 pass, 0 fail | PASS |
| solution.js exports correct functions | `node -e "import('./agents/solution.js').then(m => { console.log(typeof m.runSolutionAgent, typeof m.getKnowledge, typeof m._getKnowledgeWithDeps) })"` | `function function function` | PASS |
| scenario_cybersecurity.json is valid JSON with 15 keys | File read succeeded, 15 keys confirmed | PASS | PASS |
| scenario_fullstack.json is valid JSON with 15 keys | File read succeeded, 15 keys confirmed | PASS | PASS |
| validate-bom-scenarios.js loads without import errors | File has valid ESM imports, no syntax issues | PASS | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| S1 — RAG Quality Improvement | 05-01-PLAN.md | Per-use-case retrieval, retrieval_mode visible | SATISFIED | `_getKnowledgeWithDeps` runs one `embedQuery` per use_case, `retrieval_mode` field returned and surfaced in solution output |
| M5 — Solution Quality | 05-02-PLAN.md, 05-03-PLAN.md | Solution reads like real presale, BOM accurate using 25 SKUs, DOCX professionally formatted | PARTIAL — NEEDS HUMAN | Solution prompt: SATISFIED. BOM script + 25 SKUs: SATISFIED. DOCX professional formatting: requires human review (05-03 Task 2 blocking gate not completed) |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `test/unit/getKnowledge.test.js` | Test 1 does not assert `retrieval_mode === "vector"` — plan truth says "Unit test confirms... retrieval_mode presence" in both paths | Info | Minor gap: vector-path retrieval_mode assertion missing from Test 1. Tests 4 and 5 cover local_fallback path. The code itself returns correct retrieval_mode; only the test assertion is absent. |

No stubs, no hardcoded empty returns, no TODO/placeholder comments found in phase deliverables.

### Human Verification Required

#### 1. M5 DOCX Formatting & BOM Output Quality Review

**Test:** Run `node scripts/validate-bom-scenarios.js` from project root. Then open `output/k-edge-networks-proposal.docx` in Word/LibreOffice.

**Expected:**
- All 5 scenario BOM tables print with part_number, description, qty, unit_price, total, and catalog match flags
- Overall summary shows scenarios run and catalog match counts
- DOCX file opens without errors
- Document has professional formatting: headings, proper spacing, legible fonts
- Thai text (if any) renders correctly without encoding corruption
- Document is directly usable for a customer meeting without manual cleanup

**Why human:** M5 acceptance criterion requires presale engineers to confirm output is "usable without major edits." DOCX visual quality, Thai text rendering, and formatting professionalism cannot be verified programmatically. The 05-03 Task 2 `checkpoint:human-verify` gate is blocking and was paused pending this review. Note: in mock mode the proposal text will be English stubs — this is expected behavior per project instructions (mock mode does not invoke real LLM). The review should confirm the script runs correctly and DOCX structure is professional; Thai content quality will be verified once live credentials are configured (Phase 6).

---

## Gaps Summary

No blocking gaps. All automated checks pass. One minor observation:

- Test 1 (`getKnowledge.test.js`) asserts `embedQuery` call count = 2 but does not assert `retrieval_mode === "vector"`. The PLAN truth "Unit test confirms... retrieval_mode presence" is only fully satisfied for the local_fallback path (Tests 4 and 5). The implementation itself is correct — this is a test coverage gap only, not a functional defect. Not a blocker.

Phase is functionally complete. All artifacts exist, are substantive, are wired, and all 5 unit tests pass. The only remaining item is the blocking human review gate for M5 DOCX formatting acceptance (per 05-03-PLAN.md Task 2).

---

_Verified: 2026-04-02_
_Verifier: Claude (gsd-verifier)_
