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
**Plans:** 3/3 plans complete

Plans:
- [x] 06-01-PLAN.md — Error handling hardening: timeout, KB miss, consistent error contract in lib/chat.js + server.js
- [x] 06-02-PLAN.md — E2E chat error-path tests + frontend error rendering with retry button
- [x] 06-03-PLAN.md — Perf-check script, PM2 deployment config, Thai onboarding guide, human verification

**Exit criteria:** Team uses system for 1 real week without critical failures; feedback collected

---

## Phase Status (v1.0)

| Phase | Title | Status |
|-------|-------|--------|
| 1 | Pipeline Completion | Not Started |
| 2 | User Authentication | Complete |
| 3 | Chat Backend | Planning Complete |
| 4 | Chat UI Frontend | Planning Complete |
| 5 | Solution Quality & RAG | Complete |
| 6 | QA & Internal Release | Planning Complete |

---

# Roadmap — AI Presale System v1.1

**Goal:** Blueprint-Driven Agent Intelligence — discovery dialog, classifier, customer memory, enriched handoff, feedback loop
**Granularity:** Standard

---

## Milestone v1.1 — Blueprint-Driven Agent Intelligence

### Phases

- [ ] **Phase 7: Discovery Agent + Classifier** - Insert discovery dialog and request classifier before solution generation
- [ ] **Phase 7.1: Solution & BOM Accuracy** - Fix technical accuracy errors in solution/BOM agents (licensing rules, storage sizing, architecture decisions)
- [ ] **Phase 8: Customer Memory** - Persist cross-session customer context, vendor preferences, and project history
- [ ] **Phase 9: Enriched Handoff Artifact** - Expand proposal with risks, missing info, next steps, and options considered
- [ ] **Phase 10: Feedback Loop + UX Fixes** - Capture engineer feedback and fix chat UX gaps from UAT

---

## Phase Details

### Phase 7: Discovery Agent + Classifier
**Goal**: Users are guided through a focused discovery dialog before solution generation, and the system classifies the request to route knowledge retrieval correctly
**Depends on**: Phase 6
**Requirements**: DISC-01, DISC-02, DISC-03, DISC-04
**Success Criteria** (what must be TRUE):
  1. After typing a brief, user receives 3-4 targeted discovery questions (use case, scale, budget, existing infra) before any solution appears
  2. User can answer "I don't know" to any question and system proceeds with stated industry-standard defaults visible in the chat
  3. The entire discovery exchange completes in one user response — no multi-step blocking interview
  4. System correctly identifies the request category (HCI / DR / Backup / Security / Full-stack) and retrieves knowledge relevant to that category
**Plans**: 3 plans

Plans:
- [ ] 07-01-PLAN.md — Two-mode discovery agent (generate questions / parse answers) + schemas + unit tests
- [ ] 07-02-PLAN.md — Chat state machine integration (handleGreeting refactor + handleDiscoveryQuestions) + integration tests
- [ ] 07-03-PLAN.md — Human verification of discovery dialog quality and classifier accuracy

**UI hint**: yes

### Phase 7.1: Solution & BOM Accuracy
**Goal**: Solution and BOM agents produce technically accurate, specific proposals — correct licensing models, specific hardware quantities, committed architecture decisions — so proposals reach "real presale engineer" quality
**Depends on**: Phase 7
**Requirements**: ACC-01, ACC-02, ACC-03, ACC-04, ACC-05
**Success Criteria** (what must be TRUE):
  1. BOM agent outputs specific storage capacity in TB for every storage item (e.g., "4 x 3.84TB NVMe" not "4 x NVMe SSD")
  2. Solution agent validates M365 plan selection against user count — flags M365 Business if user_count > 300
  3. Solution agent applies Windows Server Datacenter core licensing model (min 16 cores/socket) and states the core pack count required
  4. Solution agent commits to one storage architecture (Ceph vs local NVMe) with explicit one-line rationale based on discovered network capability
  5. Solution agent includes compute sizing rationale (est. VM count × avg RAM → node RAM target)
**Plans**: TBD

### Phase 8: Customer Memory
**Goal**: The system remembers customer context, vendor preferences, and past proposals across sessions so engineers don't re-enter known information
**Depends on**: Phase 7.1
**Requirements**: MEM-01, MEM-02, MEM-03, MEM-04
**Success Criteria** (what must be TRUE):
  1. New projects are automatically named from customer/use case context extracted during discovery — "Chat Project" never appears
  2. When starting a project, user is notified if proposals for the same customer name already exist and can view them
  3. Rejected solution options from prior projects are stored and surfaced when a related project is started
  4. Vendor preferences (preferred and disliked) stored per user visibly influence the ranking of options in new solutions
**Plans**: 3 plans

Plans:
- [x] 08-01-PLAN.md — user_preferences schema + lib/user-preferences.js + new exports in lib/projects.js + unit tests
- [x] 08-02-PLAN.md — Wire memory into handleDiscoveryQuestions + solution agent + vendor preference API + integration tests
- [ ] 08-03-PLAN.md — Human verification of all four customer memory features in live chat

### Phase 9: Enriched Handoff Artifact
**Goal**: Proposals contain the full handoff context a presale engineer needs — risks, open questions, recommended next actions, and options considered
**Depends on**: Phase 8
**Requirements**: HAND-01, HAND-02, HAND-03, HAND-04
**Success Criteria** (what must be TRUE):
  1. Downloaded proposal DOCX includes a Risks section with at least one vendor-specific or solution-specific risk
  2. Downloaded proposal DOCX includes a Missing Information section listing items the engineer must confirm before quoting
  3. Downloaded proposal DOCX includes a Next Steps section with at least two actionable items
  4. Downloaded proposal DOCX includes an Options Considered section showing non-selected alternatives with one-line rationale each
**Plans**: TBD

### Phase 10: Feedback Loop + UX Fixes
**Goal**: Engineers can rate proposal quality directly in chat, ratings are visible in admin, and chat UX no longer blocks follow-up or exposes file paths
**Depends on**: Phase 9
**Requirements**: FEED-01, FEED-02, FEED-03, UX-01, UX-02
**Success Criteria** (what must be TRUE):
  1. After a proposal is displayed, thumbs up / thumbs down buttons appear and user can click one without leaving the chat
  2. Feedback rating is stored in Supabase linked to project, user, and timestamp — confirmed by admin view
  3. Admin portal feedback summary table shows project name, rating, and date for all submitted feedback
  4. After proposal is shown, chat input remains active and user can send follow-up messages or revision requests
  5. Proposal download appears only as a button — no file path text visible anywhere in the chat UI
**Plans**: TBD
**UI hint**: yes

---

## Phase Status (v1.1)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 7. Discovery Agent + Classifier | 0/3 | Planning Complete | - |
| 7.1. Solution & BOM Accuracy | 0/0 | Not started | - |
| 8. Customer Memory | 2/3 | In Progress|  |
| 9. Enriched Handoff Artifact | 0/0 | Not started | - |
| 10. Feedback Loop + UX Fixes | 0/0 | Not started | - |
