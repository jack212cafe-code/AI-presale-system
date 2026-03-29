# Roadmap — AI Presale System v1.0

**Goal:** Internal office use — chat UI + complete pipeline for team testing
**Granularity:** Standard

---

## Milestone v1.0 — Office Internal Release

### Phase 1: Pipeline Completion

**Goal:** Wire full pipeline end-to-end in server.js so single API call runs all 4 agents
**Requirements**: M1
**Depends on:** —
**Plans:** 1/2 plans executed

Plans:
- [x] 01-01-PLAN.md — Pipeline endpoint + status endpoint + persist status fixes
- [ ] 01-02-PLAN.md — Pipeline integration tests (HCI fixture)

**Exit criteria:** POST /api/pipeline with HCI fixture returns complete project record in Supabase with all 4 JSON fields populated

---

### Phase 2: User Authentication

**Goal:** Simple login so team members have isolated sessions and project history
**Requirements**: M3, M4
**Depends on:** Phase 1
**Plans:** 2/2 plans executed

Plans:
- [x] 02-01-PLAN.md — Users table, auth library, seed script, login/logout endpoints
- [x] 02-02-PLAN.md — Auth middleware on routes, project ownership (user_id FK), project list endpoint, auth tests

**Exit criteria:** 5 team members can log in with separate accounts; each sees only their own projects

---

### Phase 3: Chat Backend

**Goal:** Real-time multi-turn chat API that maintains conversation context per project
**Requirements**: M2
**Depends on:** Phase 2
**Plans:** 0 plans

Plans:
- [ ] Plan 1: Design conversations + messages table in Supabase
- [ ] Plan 2: POST /api/chat endpoint: accepts message, maintains project context, runs relevant agent stage
- [ ] Plan 3: Conversation state machine (greeting → brief → discovery → solution → bom → proposal)
- [ ] Plan 4: Streaming response support (Server-Sent Events or chunked transfer)

**Exit criteria:** curl /api/chat with multi-turn messages navigates through all pipeline stages correctly

---

### Phase 4: Chat UI Frontend

**Goal:** Browser chat interface like Claude — clean, empathy-first, multi-turn
**Requirements**: M2
**Depends on:** Phase 3
**Plans:** 0 plans

Plans:
- [ ] Plan 1: Chat layout (message thread, input bar, sidebar with project list)
- [ ] Plan 2: Render solution options as structured cards in chat
- [ ] Plan 3: Render BOM as inline table in chat
- [ ] Plan 4: Proposal download button in chat + loading states

**Exit criteria:** Team member opens browser, logs in, types Thai brief, receives solution + BOM table + download link without leaving the chat

---

### Phase 5: Solution Quality & RAG Hardening

**Goal:** Output quality meets "real presale engineer" standard
**Requirements**: M5, S1
**Depends on:** Phase 4
**Plans:** 0 plans

Plans:
- [ ] Plan 1: Per-use-case retrieval (separate embedding query per use case, deduplicate)
- [ ] Plan 2: Prompt tuning for solution agent (more specific guidance, KB-grounded)
- [ ] Plan 3: BOM accuracy validation (spot-check 5 scenarios against manual BOM)
- [ ] Plan 4: Proposal tone and structure review (Thai enterprise context)

**Exit criteria:** 3 real presale scenarios reviewed — all outputs rated "usable without major edits"

---

### Phase 6: QA & Internal Release

**Goal:** Stable enough for daily office use
**Requirements**: S2
**Depends on:** Phase 5
**Plans:** 0 plans

Plans:
- [ ] Plan 1: End-to-end test suite for chat API (multi-turn scenarios)
- [ ] Plan 2: Error handling in chat (agent failures, timeouts, KB misses)
- [ ] Plan 3: Performance check (pipeline < 60s, chat < 10s per turn)
- [ ] Plan 4: Internal release: deploy to office server, onboard team

**Exit criteria:** Team uses system for 1 real week without critical failures; feedback collected

---

## Phase Status

| Phase | Title | Status |
|-------|-------|--------|
| 1 | Pipeline Completion | Not Started |
| 2 | User Authentication | Complete |
| 3 | Chat Backend | Not Started |
| 4 | Chat UI Frontend | Not Started |
| 5 | Solution Quality & RAG | Not Started |
| 6 | QA & Internal Release | Not Started |
