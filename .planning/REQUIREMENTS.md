# Requirements — AI Presale System v1.0

**Milestone:** v1.0 — Internal office use
**Scope:** Complete pipeline + Chat UI for team testing

---

## Must Have (MVP)

### M1 — Complete Agent Pipeline (end-to-end in server)
- Full pipeline callable via single API: intake → discovery → solution → BOM → proposal
- solution_json, bom_json, proposal_url all persisted to projects table
- Streaming or progressive responses (not blocking UI for 30s)

### M2 — Chat UI (multi-turn, browser)
- Chat interface in browser: input field, message thread, assistant replies
- Multi-turn: system maintains context within a project conversation
- Thai/English input accepted
- Shows solution options, BOM table, and download link inline

### M3 — User Authentication
- Login with username/password (simple, for office team ~5 people)
- Sessions persist across browser closes
- Each user has their own project history

### M4 — Cross-session Project History
- List of past projects accessible after login
- Can click into a past project and see the conversation + outputs
- Can download DOCX from past projects

### M5 — Solution Quality
- Solution output reads like a real presale recommendation (not generic)
- BOM pricing accurate using 25 SKUs in pricing_catalog
- Proposal DOCX professionally formatted and directly usable

---

## Should Have

### S1 — RAG Quality Improvement
- Per-use-case retrieval (separate queries per use case, merge results)
- retrieval_mode visible in output for debugging

### S2 — Error handling in chat
- If agent fails mid-pipeline, chat shows useful error (not blank)
- Can retry from failed step

### S3 — KB quality
- At least 50+ KB entries for good retrieval coverage
- Real pricing data for top 5 vendors

---

## Won't Have (this milestone)

- n8n orchestration — defer to v2.0
- Human approval gate — defer (team self-reviews)
- SaaS billing/subscription — defer to v2.0
- Multi-tenant / org management — defer to v2.0
- Line/email notifications — defer to v2.0
- Public deployment — defer

---

## Acceptance Criteria

| Requirement | Acceptance Test |
|-------------|-----------------|
| M1 Pipeline | POST /api/pipeline with HCI brief → returns solution + BOM + proposal_path in <60s |
| M2 Chat UI | User types Thai brief → sees solution options + BOM table + download link in chat |
| M3 Auth | Login → session persists after browser close → /chat works |
| M4 History | After login → see list of past projects → click → see full conversation |
| M5 Quality | 3 presale engineers review 3 outputs: all rated "usable without major edits" |
