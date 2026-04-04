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

**Goal:** Multi-turn chat API with stage state machine that routes messages through pipeline agents per project
**Requirements**: M2
**Depends on:** Phase 2
**Plans:** 2/3 plans executed

Plans:
- [x] 03-01-PLAN.md — Conversations + messages schema, conversation CRUD library
- [x] 03-02-PLAN.md — POST /api/chat endpoint with stage state machine and pipeline integration
- [ ] 03-03-PLAN.md — Chat endpoint integration tests

**Exit criteria:** curl /api/chat with multi-turn messages navigates through all pipeline stages correctly

---

### Phase 4: Chat UI Frontend

**Goal:** Browser chat interface like Claude — clean, empathy-first, multi-turn
**Requirements**: M2
**Depends on:** Phase 3
**Plans:** 3/5 plans executed

Plans:
- [x] 04-01-PLAN.md — Server routes + API endpoints (proposal download, conversation messages)
- [x] 04-02-PLAN.md — Login page (login.html + login.js)
- [x] 04-03-PLAN.md — Chat HTML/CSS shell (full-height layout, sidebar, thread, composer)
- [ ] 04-04-PLAN.md — Chat JS logic (messaging, solution cards, loading, sidebar, download)
- [ ] 04-05-PLAN.md — Human verification of complete chat flow

**Exit criteria:** Team member opens browser, logs in, types Thai brief, receives solution + BOM table + download link without leaving the chat

---

### Phase 5: Solution Quality & RAG Hardening

**Goal:** Output quality meets "real presale engineer" standard
**Requirements**: M5, S1
**Depends on:** Phase 4
**Plans:** 3/3 plans executed

Plans:
- [x] 05-01-PLAN.md — Per-use-case RAG retrieval refactor + test fixtures
- [x] 05-02-PLAN.md — Solution prompt + proposal prompt rewrite for Thai enterprise
- [x] 05-03-PLAN.md — BOM validation script + human quality review

**Exit criteria:** 3 real presale scenarios reviewed — all outputs rated "usable without major edits"

---

### Phase 6: QA & Internal Release

**Goal:** Stable enough for daily office use
**Requirements**: S2
**Depends on:** Phase 5
**Plans:** 3 plans

Plans:
- [ ] 06-01-PLAN.md — Error handling hardening: timeout, KB miss, consistent error contract in lib/chat.js + server.js
- [ ] 06-02-PLAN.md — E2E chat error-path tests + frontend error rendering with retry button
- [ ] 06-03-PLAN.md — Perf-check script, PM2 deployment config, Thai onboarding guide, human verification

**Exit criteria:** Team uses system for 1 real week without critical failures; feedback collected

---

## Phase Status

| Phase | Title | Status |
|-------|-------|--------|
| 1 | Pipeline Completion | Not Started |
| 2 | User Authentication | Complete |
| 3 | Chat Backend | Planning Complete |
| 4 | Chat UI Frontend | Planning Complete |
| 5 | Solution Quality & RAG | Complete |
| 6 | QA & Internal Release | Planning Complete |
