# Phase 5: Solution Quality & RAG Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-01
**Phase:** 05-solution-quality-rag-hardening
**Areas discussed:** RAG retrieval strategy, Solution prompt depth, Proposal tone & structure, BOM validation

---

## RAG Retrieval Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Per-use-case queries | Separate embedding query per use_case, deduplicate results | ✓ |
| Single combined query | One query: projectObjective + all use_cases joined + scale (current) | |
| Hybrid: combined + per-use-case | Combined for overall context + per-use-case for depth | |

**User's choice:** Per-use-case queries

---

| Option | Description | Selected |
|--------|-------------|----------|
| Top-5 total after dedup | Keep same 5-chunk limit, pick highest-scored unique chunks across all queries | ✓ |
| Top-3 per use-case (uncapped) | Keep top-3 per use-case, no total cap — up to 9 chunks for 3 use-cases | |
| Configurable cap | Config value KB_MATCH_COUNT, default 5 | |

**User's choice:** Top-5 total after dedup

---

## Solution Prompt Depth

| Option | Description | Selected |
|--------|-------------|----------|
| IT presale for Thai enterprise | Rewrite prompt: HCI/3-Tier/Backup/DR/Cybersec domain, vendor-specific, Thai enterprise buying context | ✓ |
| Generic presale, domain via KB only | Keep prompt general, rely on KB chunks for domain knowledge | |
| Domain sections in prompt | Add explicit Domain Guide section per vertical | |

**User's choice:** IT presale for Thai enterprise

---

| Option | Description | Selected |
|--------|-------------|----------|
| Component-level with rationale | Name specific components/tiers + 1-2 sentence WHY explanation | ✓ |
| High-level conceptual only | Describe architecture approach, not specific components | |
| Vendor stack list only | Just enumerate vendor stack + key rationale bullets | |

**User's choice:** Component-level with rationale

---

## Proposal Tone & Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Thai | Full Thai — all 4 fields in Thai | ✓ |
| English | Full English | |
| Bilingual (Thai + English) | Each section in Thai with English subtitle | |

**User's choice:** Thai

---

| Option | Description | Selected |
|--------|-------------|----------|
| Current 4 fields, better content | Keep existing schema, improve prompt guidance | ✓ |
| Add scope & investment section | Add scope_of_work + investment_summary (schema change required) | |
| Full proposal structure | Add company intro, problem statement, scope, timeline, investment, terms | |

**User's choice:** Current 4 fields, better content

---

## BOM Validation

| Option | Description | Selected |
|--------|-------------|----------|
| Script + manual review | Node.js script runs 5 scenarios, prints comparison table, human reviews | ✓ |
| Automated assertions | Assertions: every BOM item must match catalog SKU, price within ±10% | |
| Human-only checklist | No script, manual chat UI run + spreadsheet review | |

**User's choice:** Script + manual review

---

| Option | Description | Selected |
|--------|-------------|----------|
| Top 5 priority for Phase 5 | HCI, Backup & Recovery, DR, Cybersecurity, Full stack | ✓ |
| All 16 in Phase 5 | Build fixtures for all 16 user-listed scenarios | |
| You decide the 5 | Claude picks 5 based on KB coverage and available SKUs | |

**User's choice:** Top 5 priority (HCI, Backup & Recovery, DR, Cybersecurity, Full stack)
**Notes:** User provided 16 total scenarios: HCI, 3-Tier, Backup & Recovery, DR, Ransomware Protection, Cybersecurity, Full stack, Pure server, Pure storage, NAS, SAN, Object storage, Software Defined Storage, Parallel storage, AI server, GPU server. Remaining 11 deferred to Phase 6 or future KB expansion.

---

## Claude's Discretion

- Exact deduplication tie-breaking strategy
- Internal structure of per-use-case retrieval loop (sequential vs. parallel async)
- Specific wording of individual prompt sections

## Deferred Ideas

- 11 additional BOM test scenarios beyond the Phase 5 top-5 (listed above)
