# Presale Expert System — Design Spec
**Date:** 2026-04-12
**Version:** 1.0
**Owner:** Pitsanu

---

## Problem

Small-medium Thai SIs (5–30 people) cannot do presale independently. They lack domain expertise, depend entirely on distributors to design solutions, and cannot present a credible solution to customers on their own. They also have no legitimate spec document to send distributors when requesting official BOM quotes.

This is not a speed problem — it is a capability gap.

---

## Solution (Approach 2 — Presale Expert System)

Add four features to the existing pipeline. All features render or improve existing data — no new agents, no new DB tables for core flow.

---

## Feature 1: Technical Spec Sheet Export

### Purpose
A structured .docx document the SI sends to distributors, replacing vague email requests with a professional spec that distributors can immediately quote against.

### Document Sections
1. **Header** — SI company name placeholder, date, project ID
2. **Customer & Project Summary** — customer name (optional), project type, timeline
3. **Workload Profile** — VM count, vCPU, vRAM, storage capacity, IOPS, protocol, users, data growth rate
4. **Architecture Requirements** — selected solution option, HA level (N+1/N+2), DR requirement (RPO/RTO), compliance/TOR flags
5. **Vendor & Product Family Preference** — vendor stack from solution_json, recommended product families, exclusions
6. **Open for Distributor** — blank fields: Recommended SKUs, List Price, Special/Project Price, Delivery Lead Time, Notes

### Implementation
- New file: `lib/specsheet.js` — renders docx from `solution_json` + `requirements_json` (no LLM call)
- New endpoint: `GET /api/projects/:id/export/spec`
- UI: add "Export Spec Sheet (.docx)" button at stage `bom` and `complete` in `chat/chat.js`
- Data source: `solution_json.options[selected_option]` + `requirements_json` — all data exists today

### Constraints
- No new LLM call — pure structured data render
- Customer name field must be optional (SI may not want to reveal customer to distributor)

---

## Feature 2: "Why This Solution" Narrative in Proposal

### Purpose
Add a section to proposal.docx that explains the reasoning behind the recommendation. Makes the SI appear credible and expert in front of the customer.

### New Section Structure (inserted after Executive Summary)
- **Problem framing** — the customer's core needs in plain language
- **Why this architecture** — why this solution type fits better than alternatives
- **Key trade-offs** — brief explanation of why other options were not selected
- **Risk mitigations** — what the design accounts for

### Example Output
```
ทำไมเราแนะนำ HCI (Nutanix) สำหรับโครงการนี้

ลูกค้าต้องการระบบที่ manage ง่าย ไม่มี dedicated IT admin และต้องการ
HA สำหรับ 80 VMs โดยมี budget จำกัด

HCI เหมาะกว่า 3-tier เพราะ:
- ลด complexity ในการ manage จาก 3 systems เหลือ 1
- Scale ได้ node-by-node ตาม budget
- Built-in backup และ DR ไม่ต้องซื้อ license แยก

ทางเลือก 3-tier ถูกตัดออกเพราะต้องการ dedicated storage admin
ซึ่งลูกค้าไม่มี capacity รองรับ
```

### Implementation
- **`agents/_prompts/proposal.md`** — add instruction: generate `why_section` with fields: `problem_framing`, `why_architecture`, `trade_offs`, `risk_mitigations`
- **`lib/proposal.js`** — add section slot after Executive Summary, render `why_section` fields
- Token cost: +150–200 tokens per proposal call — negligible

---

## Feature 3: Guided Discovery

### Purpose
SI operators who lack domain knowledge can answer discovery questions confidently, knowing why each question is being asked and what to do if they don't know the answer.

### Design
Each discovery question is accompanied by a collapsible hint with two fields:
- **purpose** — why the system is asking (e.g., "ใช้สำหรับ sizing compute tier")
- **if_unsure** — what to do when the operator doesn't know (e.g., "ถามลูกค้าว่า มี server กี่ตัวที่ต้องการย้ายมาเป็น VM?")

Hint is collapsible — does not disrupt operators who already know the answer.

### Implementation
1. **`agents/_prompts/discovery.md`** — add instruction to emit each question as:
   ```json
   {
     "question": "...",
     "hint": {
       "purpose": "...",
       "if_unsure": "..."
     }
   }
   ```
2. **`agents/discovery.js`** — parse hint fields from LLM response
3. **`chat/chat.js` + `chat/chat.html`** — render hint as collapsible element under each question bubble

### Constraints
- Hint is display-only — does not affect downstream pipeline, validation, or state machine
- If hint field is absent (legacy or fallback), UI renders question without hint — graceful degradation

---

## Feature 4: Deal Pipeline Dashboard

### Purpose
SI manager or engineer sees all active deals in one place — stage, customer, last activity, and quick actions — without having to remember which deal is where.

### Page: `/pipeline`

```
┌─────────────────────────────────────────────────────┐
│  Deal Pipeline                    [+ New Deal]      │
├──────────┬──────────┬──────────┬──────────┬─────────┤
│ DISCOVERY│ SOLUTION │   BOM    │ COMPLETE │  ALL    │
│    3     │    5     │    2     │    8     │   18    │
├─────────────────────────────────────────────────────┤
│ ลูกค้า A   HCI + Backup   BOM      3 เม.ย.         │
│ [Resume] [Export BOM] [Export Spec Sheet]            │
├─────────────────────────────────────────────────────┤
│ ลูกค้า B   DR Only         Solution  1 เม.ย.       │
│ [Resume] [Export Solution]                           │
└─────────────────────────────────────────────────────┘
```

### Stage Mapping
| `projects.status`    | Pipeline Column |
|---|---|
| `discovery_complete` | DISCOVERY |
| `solution_complete`  | SOLUTION |
| `bom_complete`       | BOM |
| `proposal_complete`  | COMPLETE |

### Implementation
- New files: `pipeline/pipeline.html` + `pipeline/pipeline.js`
- Data: existing `GET /api/projects` endpoint — no new API needed
- Actions: Resume → `/chat?project_id=xxx`; Export → existing export endpoints
- Auth: existing session cookie — shows only current user's projects
- No new DB table

---

## What Does NOT Change
- Pipeline agents (discovery, specialist, solution, BOM, proposal)
- Database schema (no new tables for core flow)
- State machine stages
- BOM.xlsx export
- TOR compliance
- Admin KB management
- Auth system

---

## Build Order

1. Technical Spec Sheet (`lib/specsheet.js` + endpoint + UI button)
2. "Why This Solution" narrative (prompt + proposal template)
3. Guided Discovery (prompt + parser + frontend)
4. Pipeline Dashboard (new frontend page)

Each feature is independent — can be built and tested separately.

---

## Success Criteria

- Pilot SI can send a Technical Spec Sheet to distributor and receive an official quote without back-and-forth clarification
- Pilot SI's proposal includes a WHY section that customer finds convincing
- Non-expert operator completes discovery with hints without needing to ask a colleague
- SI manager can see all deal stages without opening each project individually

---

## 12-Month Vision (out of scope for this spec)

Distributor Channel Tool — sell platform access to distributors (Dell Thailand, HPE, Ingram) who distribute to their SI channel. Each feature built here becomes a multi-tenant, distributor-branded offering.
