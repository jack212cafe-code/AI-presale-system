# AI Presale System

## Current Milestone: v1.1 Blueprint-Driven Agent Intelligence

**Goal:** ยกระดับ agent pipeline ให้ตรงกับ blueprint — discovery dialog, request classifier, customer memory, enriched handoff artifact, feedback loop

**Target features:**
- Discovery Agent — ถาม 3-5 คำถามก่อน generate solution
- Request Classifier — จำแนก use case (HCI / DR / Backup / Security / Full-stack) ก่อน route
- Customer Memory — จำ context ลูกค้าข้าม session
- Enriched Handoff Artifact — proposal มี risks, missing info, next human action
- Feedback Loop — capture ว่า engineer แก้ output อะไรบ้าง

---

## What This Is

AI-powered presale assistant for IT solution companies. Users chat with the system in Thai/English, describe a customer's requirements, and receive structured solution recommendations, BOM with pricing, and a downloadable proposal DOCX — like having a real presale engineer on demand.

Built for internal use by SI/Distributor teams. Long-term goal: SaaS product with subscription packaging.

## Core Value

A presale engineer should be able to drop a customer brief into the chat and get a trustworthy, exportable proposal in minutes — not hours.

## Requirements

### Validated

- ✓ Multi-agent pipeline (intake → discovery → solution → BOM → proposal) — Phase 0-4
- ✓ Knowledge base with vector embeddings (36+ seed docs, OpenAI text-embedding-3-small) — Phase 2
- ✓ Supabase persistence (projects, agent_logs, pricing_catalog, knowledge_base) — Phase 2
- ✓ OpenAI integration with mock/live dual-mode — Phase 1
- ✓ Admin KB portal (upload, list, delete documents) — Phase 2
- ✓ Solution JSON persisted with retrieval_mode tracking — Phase 5
- ✓ BOM quantity derived from requirements.scale — Phase 6
- ✓ Pricing catalog: 25 SKUs across Nutanix, Veeam, Dell, Cisco, Fortinet, HPE — Phase 6
- ✓ Proposal DOCX generation with DOCX builder — Phase 7

### Validated (Phase 6)

- ✓ Error handling in chat — agent failure, timeout (60s), KB miss all return `{ ok: false, error }` with retry button — Phase 6
- ✓ PM2 deployment config (`ecosystem.config.cjs`) for office server — Phase 6
- ✓ Thai onboarding guide (`ONBOARDING.md`) — Phase 6
- ✓ Performance check script (`scripts/perf-check.js`) with 60s/10s thresholds — Phase 6

### Active

- [ ] Chat UI human UAT — retry button click, live multi-turn flow, ONBOARDING readability, PM2 crash recovery
- [ ] n8n orchestration — visual workflow, Line/email notifications
- [ ] SaaS subscription packaging — multi-tenant, billing, org management

### Out of Scope (this milestone)

- Human approval gate — deferred, team will self-review for now
- n8n orchestration — Node.js runtime handles pipeline; n8n adds complexity without clear benefit at office-team scale
- SaaS billing/subscription — deferred to next milestone after internal validation
- Multi-tenant org management — deferred
- Public deployment — deferred until internal feedback collected

## Context

**Current codebase state (v1.0 internal — Phase 6 complete):**
- Node.js HTTP server (`server.js`) — no framework, raw `node:http`
- 4 agents: discovery, solution, bom, proposal — each with mock fallback
- Supabase (Postgres + pgvector) for all persistence
- Admin portal at `/admin` for KB management
- Chat UI at `/chat` with multi-turn conversation, error handling, retry button
- PM2 deployment config (`ecosystem.config.cjs`) for office server
- 46/46 tests passing (node:test)

**Team context:**
- One-person presale company (Pitsanu)
- Target users for internal testing: office team
- Domain coverage: HCI, 3-Tier, Backup & Recovery, DR, Cybersecurity
- Thai enterprise market, proposals in Thai context

**Ready for internal use — pending human UAT:**
- Live multi-turn chat flow (requires Supabase + OpenAI credentials)
- PM2 deployment on office machine
- Team onboarding via ONBOARDING.md (Thai)

## Constraints

- **Tech Stack**: Node.js (no framework switch) — established patterns, working agents
- **Database**: Supabase only — already integrated, no new DB
- **LLM**: OpenAI Responses API — gpt-4o-mini for agents
- **Deployment**: Local/self-hosted for now — no cloud deploy this milestone
- **Budget**: Token cost matters — keep agent calls deterministic and minimal

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Skip n8n this milestone | Node.js runtime sufficient; n8n adds ops overhead without clear benefit at team scale | — Pending |
| Disable human_approved gate | Team self-reviews; gate adds friction without a review workflow yet | — Pending |
| Chat persists across sessions | Team expects to return to projects from previous days | — Pending |
| User auth required | Multi-session history requires identity | — Pending |
| Keep Node.js (no framework) | Existing server.js patterns work; switching frameworks mid-project is high risk | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition:**
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone:**
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-04 — Milestone v1.1 started: Blueprint-Driven Agent Intelligence*
