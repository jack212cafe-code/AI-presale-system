# Requirements — AI Presale System v1.1

**Milestone:** v1.1 — Blueprint-Driven Agent Intelligence
**Scope:** Discovery dialog, Request classifier, Customer memory, Enriched handoff, Feedback loop
**Continues from:** v1.0 (REQ-IDs continue from existing M1–S3)

---

## Milestone v1.1 Requirements

### DISC — Discovery Agent

- [ ] **DISC-01**: User is prompted with 3–4 targeted questions before solution is generated (use case type, scale, budget, existing infra)
- [ ] **DISC-02**: System classifies the request into one of: HCI / DR / Backup / Security / Full-stack — and uses this to route to the appropriate knowledge retrieval
- [ ] **DISC-03**: If the user cannot answer a discovery question, system proceeds with industry-standard defaults and documents the assumptions explicitly in the proposal
- [ ] **DISC-04**: Discovery completes in a single conversational round-trip (not a multi-step interview blocking the user)

### ACC — Solution & BOM Accuracy

- [ ] **ACC-01**: BOM agent outputs specific storage capacity in TB for every storage item (not just "NVMe SSD")
- [ ] **ACC-02**: Solution agent validates M365 plan against user_count — flags M365 Business plan when user_count > 300, recommends E3/E5
- [ ] **ACC-03**: Solution agent applies Windows Server Datacenter core licensing model: states minimum core pack count required (min 16 cores/socket × socket count × node count)
- [ ] **ACC-04**: Solution agent commits to one storage architecture (Ceph vs local NVMe) with explicit one-line rationale derived from discovered network capability
- [ ] **ACC-05**: Solution agent includes compute sizing rationale: estimated VM count × average RAM per VM = node RAM target

### MEM — Customer Memory

- [x] **MEM-01**: Project is automatically named from customer/use case context extracted during discovery (replaces "Chat Project")
- [x] **MEM-02**: Rejected solution options are stored per project and surfaced if user starts a related project
- [x] **MEM-03**: Preferred and disliked vendors are stored per user and influence future solution ranking
- [x] **MEM-04**: When starting a new project, system checks if proposals for the same customer name exist and offers to show them

### HAND — Enriched Handoff Artifact

- [ ] **HAND-01**: Proposal includes a Risks section listing key risks of the selected solution (e.g., vendor lock-in, licensing cost, support SLA)
- [ ] **HAND-02**: Proposal includes a Missing Information section listing what the engineer still needs to confirm before quoting (e.g., network topology, rack space)
- [ ] **HAND-03**: Proposal includes a Next Steps section with actionable items for the engineer (e.g., "Send BOM to distributor", "Schedule sizing workshop")
- [ ] **HAND-04**: Proposal includes an Options Considered section showing non-selected options with one-line rationale for why they were not recommended

### FEED — Feedback Loop

- [ ] **FEED-01**: After proposal is displayed in chat, user sees thumbs up / thumbs down buttons
- [ ] **FEED-02**: Feedback rating (positive/negative) is stored in Supabase linked to project ID, user ID, and timestamp
- [ ] **FEED-03**: Admin portal shows a feedback summary table (project, rating, date)

### UX — UX Fixes (from v1.0 UAT)

- [ ] **UX-01**: Chat input remains active after proposal is generated — user can type follow-up questions or request revisions
- [ ] **UX-02**: Proposal download shows only as a button — local file path is never exposed in the chat UI

---

## Future Requirements (Deferred)

- Discovery via voice input — defer to v2.0
- Multi-language proposal output selection — defer
- CRM integration (pull customer data) — defer
- Automatic feedback-driven prompt improvement — defer
- Line/email notifications when proposal ready — defer

---

## Out of Scope (this milestone)

| Feature | Reason |
|---------|--------|
| n8n orchestration | Node.js pipeline sufficient at team scale |
| SaaS billing/subscription | Internal-only use until v2.0 |
| Multi-tenant org management | Single-user team for now |
| Public deployment | Pending internal validation |
| Human approval gate | Team self-reviews; gate adds friction |

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| DISC-01 | Phase 7 | Pending |
| DISC-02 | Phase 7 | Pending |
| DISC-03 | Phase 7 | Pending |
| DISC-04 | Phase 7 | Pending |
| ACC-01 | Phase 7.1 | Pending |
| ACC-02 | Phase 7.1 | Pending |
| ACC-03 | Phase 7.1 | Pending |
| ACC-04 | Phase 7.1 | Pending |
| ACC-05 | Phase 7.1 | Pending |
| MEM-01 | Phase 8 | Complete |
| MEM-02 | Phase 8 | Complete |
| MEM-03 | Phase 8 | Complete |
| MEM-04 | Phase 8 | Complete |
| HAND-01 | Phase 9 | Pending |
| HAND-02 | Phase 9 | Pending |
| HAND-03 | Phase 9 | Pending |
| HAND-04 | Phase 9 | Pending |
| FEED-01 | Phase 10 | Pending |
| FEED-02 | Phase 10 | Pending |
| FEED-03 | Phase 10 | Pending |
| UX-01 | Phase 10 | Pending |
| UX-02 | Phase 10 | Pending |
