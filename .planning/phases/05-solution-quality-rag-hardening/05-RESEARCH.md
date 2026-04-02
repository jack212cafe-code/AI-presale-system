# Phase 5: Solution Quality & RAG Hardening - Research

**Researched:** 2026-04-02
**Domain:** RAG retrieval strategy, prompt engineering, BOM validation scripting
**Confidence:** HIGH (all findings based on direct code inspection)

## Summary

Phase 5 is a quality improvement pass over three existing agents: `solution.js` (retrieval + prompt), `proposal.js` (prompt only), and `bom.js` (validation script only). No schema changes, no new agents, no new pipeline stages. All implementation points are internal rewrites of existing functions and prompt files.

The current retrieval in `getKnowledge()` builds a single concatenated query string from all use_cases and runs one embedding call. The fix is to loop over `requirements.use_cases`, call `embedQuery` + `retrieveKnowledgeFromVector` once per use_case, then merge and deduplicate by chunk `id` keeping top-5 by similarity score. The fallback path (`retrieveLocalKnowledge`) must mirror this loop.

The current solution prompt (`agents/_prompts/solution.md`) is written for a SaaS multi-agent product and references cloud-SaaS framing throughout — it must be fully replaced with Thai enterprise IT presale framing covering the five domains and six vendor families in `pricing_catalog`. The proposal prompt is three lines with no language, tone, or field guidance — it needs expanded instructions for Thai formal register and field-level content rules.

**Primary recommendation:** Implement per-use-case retrieval loop first (Plan 1), then rewrite prompts (Plans 2 and 4), then build the BOM validation script (Plan 3) for human review.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**RAG Retrieval Strategy**
- D-01: Switch from single combined query to per-use-case separate embedding queries. Run one query per `use_case` in `requirements.use_cases`.
- D-02: After running all per-use-case queries, deduplicate by chunk ID and keep the top-5 unique chunks ranked by score across all queries. Total chunk budget passed to solution agent stays at 5.
- D-03: Fallback behavior unchanged — if vector retrieval fails, fall back to local keyword search (existing pattern in `agents/solution.js`).

**Solution Prompt**
- D-04: Rewrite the solution prompt from SaaS-framing to IT presale for Thai enterprise. Remove all SaaS/cloud SaaS language.
- D-05: New prompt must reflect: Domain: HCI, 3-Tier, Backup & Recovery, DR, Cybersecurity. Vendor context: Nutanix, Veeam, Fortinet, Dell, Cisco, HPE — all in pricing_catalog. Thai enterprise buying context: budget sensitivity, local support availability, local distributor relationships.
- D-06: Architecture descriptions in each option must be component-level with rationale — name specific components/tiers (e.g., "3-node Nutanix NX cluster + Veeam B&R for backup") with 1-2 sentences explaining WHY this fits the requirement.

**Proposal Prompt & DOCX**
- D-07: Proposal output language is Thai. All 4 fields (executive_summary, solution_overview, assumptions, next_steps) must be written in Thai.
- D-08: Keep the existing 4-field schema — no schema change, no new DOCX template sections. Improve the prompt guidance for each field to produce Thai enterprise-appropriate content.
- D-09: Proposal prompt must instruct: formal Thai enterprise register, concise executive_summary (2-3 paragraphs), solution_overview that references the selected option's architecture, practical next_steps with clear action owner.

**BOM Validation**
- D-10: Plan 3 validation uses a Node.js script that runs 5 test scenarios through the BOM agent and prints a comparison table: requested items vs. pricing_catalog match, per-item price, total.
- D-11: The 5 priority scenarios for Phase 5: HCI, Backup & Recovery, DR, Cybersecurity, Full stack (all domains combined).
- D-12: The remaining 11 scenarios (3-Tier, Ransomware Protection, Pure server, Pure storage, NAS, SAN, Object storage, SDS, Parallel storage, AI server, GPU server) are deferred to Phase 6 QA or a future KB expansion phase.
- D-13: Validation is human review of script output — not automated assertions. Reviewer checks SKU match quality and price reasonableness, notes issues.

### Claude's Discretion
- Exact deduplication tie-breaking strategy (when two chunks from different use-cases have identical scores)
- Internal structure of per-use-case retrieval loop (sequential vs. parallel async calls)
- Specific wording of individual prompt sections (beyond the constraints in D-05, D-06, D-09)

### Deferred Ideas (OUT OF SCOPE)
- 11 BOM scenarios: 3-Tier, Ransomware Protection, Pure server, Pure storage, NAS, SAN, Object storage, Software Defined Storage, Parallel storage, AI server, GPU server
- New pipeline stages, schema changes, new proposal sections, new agent types
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| M5 | Solution output reads like a real presale recommendation (not generic). BOM pricing accurate using 25 SKUs. Proposal DOCX professionally formatted and directly usable. | D-04/D-05/D-06 cover solution quality. D-10/D-11/D-13 cover BOM accuracy. D-07/D-08/D-09 cover proposal. |
| S1 | Per-use-case retrieval (separate queries per use case, merge results). retrieval_mode visible in output for debugging. | D-01/D-02/D-03 directly address S1. `retrieval_mode` field already exists in sanitizeSolution output. |
</phase_requirements>

---

## Standard Stack

### Core (no new dependencies)
| Component | Location | Purpose |
|-----------|----------|---------|
| `embedQuery(text)` | `lib/openai.js` | Generate embedding per use-case string |
| `retrieveKnowledgeFromVector(embedding, matchCount)` | `lib/supabase.js` | Vector search — call once per use-case |
| `retrieveLocalKnowledge(query, n)` | `knowledge_base/shared.js` | Local keyword fallback — call once per use-case |
| `getKnowledge(requirements)` | `agents/solution.js:64` | Refactor target — same public signature, new internals |
| `withAgentLogging` | `lib/logging.js` | Wrap pattern — unchanged |
| `validateSolution` / `sanitizeSolution` | `lib/validation.js` / `agents/solution.js` | Downstream of retrieval — no changes needed |

### Supporting
| Component | Location | Purpose |
|-----------|----------|---------|
| `runBomAgent(solution, options)` | `agents/bom.js` | Called by BOM validation script |
| `getPricingRowsByVendors(vendors)` | `lib/supabase.js` | BOM script uses directly for comparison table |
| `scripts/complete-bom-flow.js` | `scripts/` | Pattern template for new BOM validation script |

**No new npm packages required for any plan in this phase.**

---

## Architecture Patterns

### Plan 1: Per-Use-Case Retrieval Loop

**Refactor `getKnowledge(requirements)` in-place** — same function signature, same return shape `{ chunks, retrieval_mode }`.

Current single-query flow:
```
query = join(use_cases) → embedQuery → retrieveKnowledgeFromVector(5) → return chunks[0..4]
```

New per-use-case flow:
```
for each use_case in requirements.use_cases:
  embedding = embedQuery(use_case)
  results = retrieveKnowledgeFromVector(embedding, 5)  // over-fetch per use-case
  accumulate results

deduplicate by chunk.id, keep highest similarity score per id
sort descending by similarity
return top-5 unique chunks
```

**Deduplication logic (Claude's discretion — recommended):**
Use a `Map<id, chunk>` where you only replace an entry if the new similarity score is higher. This is deterministic and simple.

**Tie-breaking (Claude's discretion — recommended):**
When two chunks from different use-cases have identical scores, keep the one encountered first (stable insertion order). No additional complexity needed.

**Sequential vs. parallel (Claude's discretion — recommended):**
Use `Promise.all()` for parallel embedding + retrieval calls. This reduces latency when requirements have 3+ use_cases. The embedQuery and retrieveKnowledgeFromVector calls are independent.

**Fallback path** — mirror the same loop using `retrieveLocalKnowledge` per use-case, then deduplicate by `source_key` (local entries have no `id` field; use source_key as dedup key).

**retrieval_mode values** — keep existing `"vector"` and `"local_fallback"`. No new values needed for S1.

```javascript
// Recommended pattern for getKnowledge refactor
async function getKnowledge(requirements) {
  const useCases = requirements.use_cases;

  if (hasSupabaseAdmin() && hasEmbeddingConfig()) {
    try {
      const perUseCase = await Promise.all(
        useCases.map(async (useCase) => {
          const embedding = await embedQuery(useCase);
          return retrieveKnowledgeFromVector(embedding, 5);
        })
      );
      const byId = new Map();
      for (const results of perUseCase) {
        for (const chunk of results) {
          const existing = byId.get(chunk.id);
          if (!existing || chunk.similarity > existing.similarity) {
            byId.set(chunk.id, chunk);
          }
        }
      }
      const chunks = [...byId.values()]
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5);
      return { chunks, retrieval_mode: "vector" };
    } catch (err) {
      console.warn(`[solution] Vector retrieval failed, falling back: ${err.message}`);
    }
  }

  // Local fallback: per-use-case keyword search, dedup by source_key
  const perUseCase = await Promise.all(
    useCases.map((useCase) => retrieveLocalKnowledge(useCase, 5))
  );
  const byKey = new Map();
  for (const results of perUseCase) {
    for (const chunk of results) {
      if (!byKey.has(chunk.source_key)) {
        byKey.set(chunk.source_key, chunk);
      }
    }
  }
  const chunks = [...byKey.values()]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 5);
  return { chunks, retrieval_mode: "local_fallback" };
}
```

**Critical note on local fallback dedup key:** `retrieveLocalKnowledge` returns entries with `source_key` (e.g., `"seed/nutanix-hci.md"`). Local entries do NOT have an `id` field — use `source_key` for deduplication there.

### Plan 2: Solution Prompt Rewrite

**File:** `agents/_prompts/solution.md` — full replacement.

**Current prompt problems (verified by reading file):**
- Line 1: "You are the Solution Design Agent for a cloud SaaS Multi-Agent System presale motion." — wrong framing
- References SaaS operability, tenant isolation throughout
- No mention of HCI, Backup, DR, Cybersecurity domains
- No mention of Nutanix, Veeam, Fortinet, Dell, Cisco, HPE
- No Thai enterprise context
- No component-level architecture guidance

**New prompt must contain:**
1. Role: IT presale solution agent for Thai enterprise customers
2. Domain coverage: HCI, 3-Tier, Backup & Recovery, Disaster Recovery, Cybersecurity
3. Vendor catalog: Nutanix, Veeam, Fortinet, Dell, Cisco, HPE (all have SKUs in pricing_catalog)
4. Thai enterprise buying context: budget in THB, local support, local distributor relationships, budget sensitivity
5. Architecture rule: each option's `architecture` field must name specific components/tiers + 1-2 sentence rationale
6. Format constraint: return valid JSON matching the existing schema (options/selected_option/notes)
7. Instruction to use provided KB chunks as evidence for recommendations
8. Handling incomplete requirements: state assumptions explicitly in `notes`

**Output schema is unchanged** — `solutionTextFormat` in `agents/solution.js` enforces the JSON shape via OpenAI structured outputs. The prompt only changes the content guidance, not the schema.

### Plan 3: BOM Validation Script

**File to create:** `scripts/validate-bom-scenarios.js`

**Pattern from:** `scripts/complete-bom-flow.js` (read above)

**Inputs:** 5 scenario fixtures. Existing fixtures cover HCI, Backup, DR. Need to add:
- `test/fixtures/scenario_cybersecurity.json` — new
- `test/fixtures/scenario_fullstack.json` — new

**Script output format (per D-10):** comparison table per scenario:
```
Scenario: HCI
┌─────────────────────┬───────────────────┬─────────┬────────────┬────────────┐
│ part_number         │ description       │ qty     │ unit_price │ total      │
│ NX-HCI-BASE         │ Nutanix HCI...    │ 3       │ 420,000    │ 1,260,000  │
└─────────────────────┴───────────────────┴─────────┴────────────┴────────────┘
Subtotal: 1,260,000 THB
Catalog match: ✓ (part_number found in pricing_catalog)
```

**Catalog match logic:** after BOM agent returns rows, check each `part_number` against the 25 known SKUs from `seed-pricing.js`. Flag rows where part_number is not in the catalog (LLM hallucinated a SKU).

**Known 25 SKUs** (from `scripts/seed-pricing.js` — confirmed by reading):
- Nutanix: NX-HCI-BASE, NX-HCI-STORAGE, NX-SW-ONLY, NX-NC2-CLOUD, NX-DR-REPLICATION
- Veeam: VEEAM-STD, VEEAM-ENT, VEEAM-ENT-PLUS, VEEAM-M365, VEEAM-IMMUTABLE
- Dell: DELL-R750XS, DELL-3TIER, DELL-ME5-SAN, DELL-VXR-4N
- Cisco: CISCO-C9300-48P, CISCO-ASR1001, CISCO-HX-4N, CISCO-FPR2130
- Fortinet: FG-200F, FG-600F, FAZ-300G, FMG-300G
- HPE: HPE-DL380-G11, HPE-SIMPLIVITY-4N, HPE-MSA2060

**Script does NOT require Supabase** if run in local mode — `runBomAgent` falls back to `fallbackCatalog` internally. However, catalog match checking needs the full 25-SKU list; embed it directly in the script as a Set constant (same data as seed-pricing.js, no runtime DB call needed for validation).

### Plan 4: Proposal Prompt Improvement

**File:** `agents/_prompts/proposal.md` — expand from 3 lines to full guidance.

**Current prompt (verified):** 7 lines total, no language instruction, no field-level guidance, no tone.

**Required additions per D-07/D-08/D-09:**
- Language instruction: all output must be in Thai (ภาษาไทย)
- Register: formal Thai enterprise register (ภาษาทางการ)
- `executive_summary`: 2-3 paragraphs, high-level problem + recommended solution + expected outcome
- `solution_overview`: reference the selected option's architecture by name and components
- `assumptions`: list technical and commercial assumptions made
- `next_steps`: include clear action owner for each step (e.g., "ฝ่ายขาย:", "วิศวกร:")
- JSON schema is unchanged (4 fields, string values)

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Embedding generation | Custom embedding client | `embedQuery()` in `lib/openai.js` — already handles auth, error, model config |
| Vector search | Direct Supabase RPC call | `retrieveKnowledgeFromVector()` in `lib/supabase.js` — already handles fallback cosine calc |
| BOM generation | New BOM logic | `runBomAgent()` in `agents/bom.js` — call it from the validation script |
| JSON schema enforcement | Prompt-only JSON enforcement | `solutionTextFormat` / `bomTextFormat` — OpenAI structured output schemas already defined, don't remove them |
| Deduplication data structure | Complex scoring algorithm | `Map<id, chunk>` with simple score comparison — sufficient for 5 use_cases × 5 chunks = 25 items max |

---

## Common Pitfalls

### Pitfall 1: Local Fallback Dedup Uses Wrong Key
**What goes wrong:** Using `chunk.id` for deduplication in the local fallback path. Local entries from `retrieveLocalKnowledge` do not have an `id` field — they have `source_key`.
**How to avoid:** Use `chunk.id` for vector path, `chunk.source_key` for local path. Check the shape returned by each function.

### Pitfall 2: Over-fetching Breaks Token Budget
**What goes wrong:** Passing matchCount=5 per use_case then keeping all results instead of capping at 5 after merge. With 3 use_cases you get up to 15 chunks into the prompt, exceeding the intended budget.
**How to avoid:** Always slice to 5 after dedup+sort. The `.slice(0, 5)` in the recommended pattern is mandatory.

### Pitfall 3: Solution Prompt Breaks JSON Schema
**What goes wrong:** Rewriting the solution prompt and accidentally instructing the LLM to add fields not in `solutionTextFormat`. With `strict: true` and `additionalProperties: false`, OpenAI will refuse or truncate output.
**How to avoid:** Do not instruct the model to add fields. The schema is enforced by `solutionTextFormat` — the prompt only guides content within the schema.

### Pitfall 4: Proposal Prompt Thai Instruction Ignored
**What goes wrong:** Adding "output in Thai" to the prompt but the LLM still returns English for some fields when the input requirements JSON is in English.
**How to avoid:** Explicitly state in the prompt: "All field values MUST be written in Thai regardless of the input language." Place this instruction at the top of the prompt, not buried at the end.

### Pitfall 5: BOM Script SKU Hallucination Not Detected
**What goes wrong:** LLM generates a part_number like "NX-HCI-PRO" that doesn't exist in pricing_catalog. Without explicit catalog-match checking, the validation table looks correct but has wrong SKUs.
**How to avoid:** Embed the 25-SKU Set in the script. After each BOM run, check every `row.part_number` against the Set and flag mismatches visually (e.g., "✗ NOT IN CATALOG").

### Pitfall 6: Parallel Promise.all Fails Silently on One Use-Case
**What goes wrong:** Using `Promise.all` for parallel embedding calls — if one use_case embedding fails, the whole `Promise.all` rejects and falls to local fallback, losing all vector results.
**How to avoid:** Use `Promise.allSettled` and filter for fulfilled results, or wrap individual calls in try/catch. This way a failure for one use_case doesn't discard results from others.

---

## Code Examples

### Deduplication Map Pattern
```javascript
// Source: derived from existing getKnowledge pattern in agents/solution.js
const byId = new Map();
for (const results of perUseCase) {
  for (const chunk of results) {
    const existing = byId.get(chunk.id);
    if (!existing || chunk.similarity > existing.similarity) {
      byId.set(chunk.id, chunk);
    }
  }
}
const chunks = [...byId.values()]
  .sort((a, b) => b.similarity - a.similarity)
  .slice(0, 5);
```

### BOM Validation Script Structure
```javascript
// Pattern from: scripts/complete-bom-flow.js
import { runSolutionAgent } from "../agents/solution.js";
import { runBomAgent } from "../agents/bom.js";
import { normalizeIntakePayload } from "../lib/intake.js";

const KNOWN_SKUS = new Set([
  "NX-HCI-BASE", "NX-HCI-STORAGE", /* ... all 25 ... */
]);

const SCENARIOS = [
  { name: "HCI", fixture: "scenario_hci.json" },
  { name: "Backup & Recovery", fixture: "scenario_backup.json" },
  { name: "DR", fixture: "scenario_dr.json" },
  { name: "Cybersecurity", fixture: "scenario_cybersecurity.json" },
  { name: "Full Stack", fixture: "scenario_fullstack.json" },
];

for (const scenario of SCENARIOS) {
  const intake = /* load fixture */;
  const solution = await runSolutionAgent(requirements);
  const bom = await runBomAgent(solution);
  // print comparison table with catalog match flags
}
```

### New Fixture Shape (Cybersecurity)
```json
{
  "customer_name": "Example Corp",
  "partner_type": "System Integrator",
  "industry": "Finance",
  "primary_use_case": "Network security modernization with NGFW and SOC",
  "users": 500,
  "vm_count": 0,
  "storage_tb": 5,
  "budget_range_thb": "2M-4M THB",
  "timeline": "Q3 2026",
  "notes": "Needs NGFW HA pair, centralized logging, policy management"
}
```

---

## Existing Fixture Coverage

| Scenario | Fixture Exists | Notes |
|----------|---------------|-------|
| HCI | `test/fixtures/scenario_hci.json` | Covers HCI + backup mentions |
| Backup & Recovery | `test/fixtures/scenario_backup.json` | Covers immutable backup, DR |
| DR | `test/fixtures/scenario_dr.json` | Covers DR planning |
| Cybersecurity | MISSING | Must create `scenario_cybersecurity.json` |
| Full Stack | MISSING | Must create `scenario_fullstack.json` |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (node:test) — inferred from package.json scripts |
| Config file | none detected |
| Quick run command | `node --test test/` |
| Full suite command | `node --test test/` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| S1 | Per-use-case retrieval runs one embedding call per use_case | unit | `node --test test/` (solution agent unit tests) | ❌ Wave 0 |
| S1 | Deduplication keeps top-5 unique chunks | unit | `node --test test/` | ❌ Wave 0 |
| S1 | retrieval_mode present in solution output | unit | `node --test test/` | ❌ Wave 0 |
| M5 | Solution output references vendor-specific components | manual | Human review of BOM validation script output | N/A |
| M5 | BOM part_numbers match pricing_catalog | manual | `node scripts/validate-bom-scenarios.js` | ❌ Wave 0 |
| M5 | Proposal output is in Thai | manual | Human review of generated proposal JSON | N/A |

### Sampling Rate
- **Per task commit:** `node --test test/` (existing 29-test suite)
- **Per wave merge:** `node --test test/`
- **Phase gate:** Full suite green + human sign-off on BOM validation script output

### Wave 0 Gaps
- [ ] `test/fixtures/scenario_cybersecurity.json` — covers M5 Cybersecurity BOM scenario
- [ ] `test/fixtures/scenario_fullstack.json` — covers M5 Full Stack BOM scenario
- [ ] Unit test for `getKnowledge` per-use-case loop — covers S1 (dedup logic, slice-to-5 enforcement)

---

## Open Questions

1. **`retrieval_mode` surface in chat UI**
   - What we know: `retrieval_mode` is set in `sanitizeSolution` and returned in the solution JSON. S1 says "retrieval_mode visible in output for debugging."
   - What's unclear: "visible in output" means returned in API response only, or also shown in chat UI?
   - Recommendation: Treat as API-level only (in solution_json) — no UI change needed. If the planner disagrees, that's a new UI task outside this phase scope.

2. **Full stack fixture use_cases list**
   - What we know: "Full stack = all domains combined" per D-11.
   - What's unclear: The exact `use_cases` array in the fixture (impacts which KB chunks are retrieved).
   - Recommendation: Use `["HCI", "Backup & Recovery", "Disaster Recovery", "Cybersecurity"]` as the use_cases array in the full-stack fixture. This exercises all 4 per-use-case retrieval paths.

---

## Environment Availability

| Dependency | Required By | Available | Notes |
|------------|------------|-----------|-------|
| Node.js | All scripts | ✓ | Existing scripts run on Node.js ESM |
| OpenAI API key | Plan 1 (embedQuery), Plan 2 (generateJson) | Config-guarded | `hasOpenAi()` check exists; mock mode available |
| Supabase | Plan 1 (vector retrieval), Plan 3 (pricing rows) | Config-guarded | `hasSupabaseAdmin()` check exists; fallback paths available |

All three plans have working mock/local fallback paths. Plans 2 and 4 (prompt rewrites) require no external services.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `agents/solution.js` — current getKnowledge implementation, sanitizeSolution, solutionTextFormat
- Direct code inspection: `agents/_prompts/solution.md` — confirmed SaaS framing requiring full replacement
- Direct code inspection: `agents/_prompts/proposal.md` — confirmed 7-line stub requiring expansion
- Direct code inspection: `lib/supabase.js` — retrieveKnowledgeFromVector signature and return shape
- Direct code inspection: `lib/openai.js` — embedQuery signature
- Direct code inspection: `knowledge_base/shared.js` — retrieveLocalKnowledge return shape (source_key field confirmed)
- Direct code inspection: `scripts/seed-pricing.js` — all 25 SKUs confirmed
- Direct code inspection: `test/fixtures/` — 6 existing fixtures, 2 missing for this phase

### Secondary (MEDIUM confidence)
- Inferred: `Promise.allSettled` safer than `Promise.all` for parallel embedding calls — based on JS error propagation behavior

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all based on direct code reading, no external dependencies
- Architecture patterns: HIGH — refactor targets are fully understood from source
- Pitfalls: HIGH — derived from actual code paths and schema constraints
- Prompt guidance: HIGH — current prompts read directly, gaps confirmed

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable codebase, no external library changes)
