# Phase 5: Solution Quality & RAG Hardening - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Improve the quality of outputs from the solution agent, BOM agent, and proposal agent so they feel like a real presale engineer produced them — not generic AI. Covers: RAG retrieval strategy changes, solution prompt rewrite, proposal prompt improvement, and BOM accuracy validation.

Does NOT include: new pipeline stages, schema changes, new proposal sections, or new agent types.

</domain>

<decisions>
## Implementation Decisions

### RAG Retrieval Strategy
- **D-01:** Switch from single combined query to **per-use-case separate embedding queries**. Run one query per `use_case` in `requirements.use_cases`.
- **D-02:** After running all per-use-case queries, **deduplicate by chunk ID** and keep the **top-5 unique chunks** ranked by score across all queries. Total chunk budget passed to solution agent stays at 5.
- **D-03:** Fallback behavior unchanged — if vector retrieval fails, fall back to local keyword search (existing pattern in `agents/solution.js`).

### Solution Prompt
- **D-04:** **Rewrite the solution prompt** from SaaS-framing to IT presale for Thai enterprise. Remove all SaaS/cloud SaaS language.
- **D-05:** New prompt must reflect:
  - Domain: HCI, 3-Tier, Backup & Recovery, DR, Cybersecurity
  - Vendor context: Nutanix, Veeam, Fortinet, Dell, Cisco, HPE — all in pricing_catalog
  - Thai enterprise buying context: budget sensitivity, local support availability, local distributor relationships
- **D-06:** Architecture descriptions in each option must be **component-level with rationale** — name specific components/tiers (e.g., "3-node Nutanix NX cluster + Veeam B&R for backup") with 1-2 sentences explaining WHY this fits the requirement.

### Proposal Prompt & DOCX
- **D-07:** Proposal output language is **Thai**. All 4 fields (executive_summary, solution_overview, assumptions, next_steps) must be written in Thai.
- **D-08:** Keep the existing 4-field schema — no schema change, no new DOCX template sections. Improve the prompt guidance for each field to produce Thai enterprise-appropriate content.
- **D-09:** Proposal prompt must instruct: formal Thai enterprise register, concise executive_summary (2-3 paragraphs), solution_overview that references the selected option's architecture, practical next_steps with clear action owner.

### BOM Validation
- **D-10:** Plan 3 validation uses a **Node.js script** that runs 5 test scenarios through the BOM agent and prints a comparison table: requested items vs. pricing_catalog match, per-item price, total.
- **D-11:** The 5 priority scenarios for Phase 5: **HCI, Backup & Recovery, DR, Cybersecurity, Full stack** (all domains combined).
- **D-12:** The remaining 11 scenarios user listed (3-Tier, Ransomware Protection, Pure server, Pure storage, NAS, SAN, Object storage, SDS, Parallel storage, AI server, GPU server) are **deferred** to Phase 6 QA or a future KB expansion phase.
- **D-13:** Validation is **human review** of script output — not automated assertions. Reviewer checks SKU match quality and price reasonableness, notes issues.

### Claude's Discretion
- Exact deduplication tie-breaking strategy (when two chunks from different use-cases have identical scores)
- Internal structure of per-use-case retrieval loop (sequential vs. parallel async calls)
- Specific wording of individual prompt sections (beyond the constraints in D-05, D-06, D-09)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Agents & Prompts
- `agents/solution.js` — Current retrieval logic (`getKnowledge` function) — rewrite target for D-01/D-02
- `agents/_prompts/solution.md` — Current solution prompt — full rewrite target for D-04/D-05/D-06
- `agents/_prompts/proposal.md` — Current proposal prompt — improvement target for D-07/D-08/D-09

### Data & Schema
- `lib/supabase.js` — `retrieveKnowledgeFromVector(embedding, matchCount)` — the function to call per use-case
- `lib/openai.js` — `embedQuery(text)` — generates embedding for a query string
- `scripts/seed-pricing.js` — source of truth for the 25 SKUs in pricing_catalog
- `test/fixtures/` — existing test fixtures (check what scenario fixtures already exist)

### Project Context
- `.planning/REQUIREMENTS.md` §M5, §S1 — requirements this phase satisfies
- `CLAUDE.md` — domain coverage list (HCI, 3-Tier, Backup & Recovery, DR, Cybersecurity)

No external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `retrieveKnowledgeFromVector(embedding, matchCount)` in `lib/supabase.js` — call this once per use-case with a per-use-case query string
- `embedQuery(text)` in `lib/openai.js` — call once per use-case string
- `retrieveLocalKnowledge(query, n)` in `knowledge_base/shared.js` — local fallback, also call per use-case

### Established Patterns
- `getKnowledge(requirements)` in `agents/solution.js` — existing retrieval wrapper; refactor this function in-place (same signature, new internals)
- `withAgentLogging` wraps all agent calls — keep this pattern unchanged
- `validateSolution` / `sanitizeSolution` — downstream of retrieval; no changes needed

### Integration Points
- `runSolutionAgent(requirements, options)` is the public API — signature unchanged
- BOM validation script should follow the pattern of `scripts/complete-bom-flow.js` (existing script)
- Test fixtures in `test/fixtures/` — check existing ones before creating new 5 scenario fixtures

</code_context>

<specifics>
## Specific Ideas

- User enumerated 16 total BOM test scenarios showing broad domain expectations for future: HCI, 3-Tier, Backup & Recovery, DR, Ransomware Protection, Cybersecurity, Full stack, Pure server, Pure storage, NAS, SAN, Object storage, Software Defined Storage, Parallel storage, AI server, GPU server. Phase 5 validates top 5; the rest are noted for future.
- "Feels like a real presale engineer" = component-level architecture descriptions + Thai language + vendor-specific framing. This is the quality bar.

</specifics>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

### Deferred BOM Scenarios (11 of 16)
User-requested scenarios not in Phase 5 scope — surface for Phase 6 or KB expansion:
- 3-Tier (Server+Storage+Network)
- Ransomware Protection
- Pure server
- Pure storage
- NAS
- SAN
- Object storage
- Software Defined Storage (SDS)
- Parallel storage
- AI server
- GPU server

</deferred>

---

*Phase: 05-solution-quality-rag-hardening*
*Context gathered: 2026-04-01*
