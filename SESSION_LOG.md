# Session Log

## 2026-04-17 (Session 9)

### Done

**Archive Obsolete Plans ✅**
- `2026-04-12-presale-expert-system.md` → ARCHIVED/ (all 8 tasks done before restart)
- `2026-04-13-commercial-hardening.md` → ARCHIVED/ (all code tasks done before restart)

**Critical Bug Fixes**
- Nutanix leaked into solution options — customer said Dell/HPE/Lenovo only → fixed in `lib/chat.js` (47d0cec)
- VMware license in HPE BOM despite customer rejecting VMware → fixed in `agents/bom.js` (47d0cec)
- LOCAL_USERS import error on Render deploy → fixed `routes/admin.js` (77e7dcd)
- KB import path double-join (`raw/raw/uploads/`) → fixed `knowledge_base/raw-import-lib.js` (b29dd98)

**Wiki/KB Order Verification**
- Solution agent: wikiContext → [KNOWLEDGE BASE] ✅ CORRECT
- Specialist agent: wikiContext → [PRODUCT KNOWLEDGE BASE] ✅ CORRECT

**Systematic Testing (HCI case: 20TB, 50VM, Dell/HPE preferred, no VMware)**
- Vendor preference extraction: Dell/HPE detected ✅
- Nutanix block: NOW WORKING ✅
- Network diagram: rendered correctly ✅
- Grounding warnings: R760xs flagged correctly ✅

**Render MCP Server**
- Configured with Bearer token rnd_BoPQwfS9DCDYAKmbyuqXp14YzgbN

### Pending

- R760/R7625 spec sheets not in KB → grounding warning misleading (need to upload Dell R760/R7625 datasheets)
- Multi-tenant Beta Tasks 5-12 (in worktree `feature/multi-tenant-beta`)
- Manual credential rotations (OpenAI, Anthropic, Supabase API keys + SENTRY_DSN)

### Key Commits Today (master)

| Commit | Description |
|--------|-------------|
| `711836a` | docs: archive completed plans |
| `77e7dcd` | fix: remove LOCAL_USERS import (deprecated) from routes/admin.js |
| `47d0cec` | fix: block Nutanix from solution options + VMware from BOM when rejected |
| `b29dd98` | fix: normalize uploaded file path in KB import (strip duplicate uploads/) |
| `4634920` | feat: add Network Diagram Generator — Mermaid topology |
| `7fa77b0` | feat: add LLM-powered Wiki Knowledge Layer |
| `1057c01` | chore: export wiki db module from lib/db/index |

---

## 2026-04-08 (Session 8)

### Done

**Vendor-Specific Presale Agents**
- `dell_presale.md`, `hpe_presale.md`, `lenovo_presale.md` — แทนที่ syseng generic
- `specialist.js` + `solution.js` + `solution.md` อัพเดตครบ

**SSE Progress Bar (Week 2 Task 2) ✅**
- `lib/chat.js` → onProgress callback
- `server.js` → /api/chat เปลี่ยนเป็น SSE
- `chat/chat.js` → ReadableStream parser + updateLoadingProgress()
- `chat/chat.html` → progress bar CSS (dots + fill + pulse)

**TOR Compliance Mode (Bonus Feature) ✅**
- `agents/tor.js` + `tor_parser.md` + `tor_compliance.md`
- `lib/tor-export.js` — CSV export พร้อม UTF-8 BOM
- `/api/tor` SSE route + `/api/tor/:id/export`
- Chat UI: TOR Mode toggle, compliance table, download CSV

### Pending
- Role-Based Access (Admin/Manager/Engineer) — Week 2
- Usage Analytics Dashboard — Week 2
- Week 3 ทั้งหมด (Streaming, KB Citations, Org/Team)

### Next Steps
1. "ทำต่อ" → เลือก Role-Based Access ก่อน (foundation ก่อน Analytics)
2. ทดสอบ TOR Mode ด้วย TOR จริง + เพิ่ม datasheet ใน KB

---

## 2026-04-06 (Session 7)

### Done

- **Specialist + RAG** — `agents/specialist.js`: added `retrieveKbForDomain()` per specialist domain
  - `syseng`: vendor-filter keywords `poweredge, powerstore, powerscale, windows-server` + vector "compute HCI sizing"
  - `devops`: vendor-filter keywords `veeam, powerprotect, powervault` + vector "backup repository"
  - `neteng`: vector only "network switch 25GbE" (no network spec sheets in KB yet)
  - `ai_eng`: Dell vendor-filter + vector "GPU inference NVIDIA"
  - KB context injected into specialist system prompt with "ground truth" instruction
  - `kbChunksInjected` logged to `agent_logs`
- **Tests**: 42/42 pass

### Pending

- Validation gates: Gate 1 (Discovery→Solution) + Gate 2 (BOM→Proposal)
- neteng KB: no network switch spec sheets uploaded yet → neteng gets vector only
- P4 systemic backlog

### Next Steps

1. **Validation Gate 1** (Discovery→Solution): ตรวจ required fields ครบก่อนส่งต่อ
2. **Validation Gate 2** (BOM→Proposal): ตรวจ GROUNDING WARNING + budget overrun ก่อน approve
3. Live test: ดู specialist `sizing_notes` มี spec จาก KB จริงไหม (e.g., R760 RAM configs)

---

## 2026-04-06 (Session 6)

### Done

- **Grounding Validator** — `lib/grounding.js`: scan BOM description fields for hardware model tokens (regex `[A-Z]{1,4}\d{3,5}`), compare against KB chunks, append `GROUNDING WARNING` rows for any model not found in KB. Called after `sanitizeBomOutput()` in `agents/bom.js`. Catches R750/PowerStore T40-style hallucinations.
- **Cost Tracking** — `lib/logging.js`: added `calcCostUsd()` with per-model rates (gpt-4o/4.1/mini/nano), `cost_usd` + `kb_chunks_injected` fields logged to `agent_logs`. `withAgentLogging` accepts `kbChunksInjected` option. BOM agent passes `kbChunks.length`.
- **Migration 09** applied — `agent_logs` มี `cost_usd` + `kb_chunks_injected` แล้ว
- **KB Coverage Check** — `scripts/check-kb-coverage.js`: verifies Dell/HPE/Veeam/Proxmox have ≥1 chunk in KB at server startup.
- **Correction Log / Feedback Loop** — `lib/corrections.js` + 3 API endpoints + Admin UI section (Log Correction form + Recent Corrections table + Push to KB button)
- **Migration 10** — `supabase/migrations/10_corrections.sql`: `corrections` table ⚠️ ต้อง apply ใน Supabase
- **Tests**: 42/42 pass

### Pending

- Apply `10_corrections.sql` ใน Supabase dashboard
- P4 systemic: proposal versioning, decision audit trail, assumptions_applied

### Next Steps

1. Apply migration `10_corrections.sql` ใน Supabase SQL Editor
2. Live test: Admin → Log Correction → Push to KB → BOM run ใหม่
3. ดู GROUNDING WARNING rows ปรากฏใน BOM output จริงไหม

---

## 2026-04-06 (Session 5)

### Done

- **Live test evaluation** — จับผิด BOM output: PowerStore T40 (hallucinated), FC switches missing from rows, Windows Server licensing absent, budget overrun ไม่ถูก flag, RAM undersized สำหรับ Windows VMs
- **KB retrieval root cause fixed** — Whitepaper (capital D sort) ครอง limit ก่อน spec sheet → เปลี่ยนเป็น 2-step: find unique files → fetch N chunks per file → `dell-powerstore-gen2-spec-sheet.pdf` chunk-001 ถูก inject พร้อม model numbers จริงแล้ว
- **RAG architecture explained** — Hybrid: Vector RAG (solution) + Keyword Filter RAG (BOM)
- **Production improvement plan** — กำหนด 4 สิ่งที่ทำน้อยได้ผลมาก สำหรับ "ไม่เดา ไม่มั่ว"

### Next Session — ทำตามลำดับนี้

#### 1. Grounding Validator (3–4 ชม.) ← เริ่มก่อน
- `lib/grounding.js` — scan BOM description fields เทียบกับ model list จาก KB
- ถ้า model ไม่อยู่ใน KB → เพิ่ม warning row ใน BOM
- เรียกหลัง `sanitizeBomOutput()` ใน `agents/bom.js`
- จับ PowerStore T40 / R750 / Unity XT style hallucination ทุกครั้ง

#### 2. Cost Tracking ใน agent_logs (1 ชม.)
- เพิ่ม field: `tokens_used`, `cost_usd`, `kb_chunks_injected` ใน `agent_logs`
- คำนวณ cost จาก token count × rate (gpt-4o: $2.50/1M input, $10/1M output)
- `kb_chunks_injected = 0` = high hallucination risk → flag

#### 3. Correction Log — Feedback Loop (2–3 ชม.)
- Schema: `corrections` table (project_id, field, wrong_value, correct_value, timestamp)
- `POST /api/projects/:id/corrections`
- Admin UI: form ง่ายๆ
- Aggregate → KB entry ใหม่ที่ inject กลับเข้า system

#### 4. KB Coverage Check at Startup (1 ชม.)
- `scripts/check-kb-coverage.js` — verify each vendor has ≥1 spec sheet in KB
- เรียกตอน server start → log warning ถ้า vendor ขาด

### Tests
19/19 pass (ณ สิ้น Session 5)

---

## 2026-04-06 (Session 4)

### Done

**P0 — Critical bugs (ทั้งหมดแก้แล้ว)**
- BUG-001: `vendorStack` moved before try block ใน `agents/bom.js` → KB inject ทำงานได้แล้ว
- Mock contamination: `buildMockSolution()` + `MOCK_BRIEFS.syseng/neteng` ลบ Nutanix hardcode ออก
- `isAiWorkload()`: เปลี่ยนเป็น regex word boundary `/\bai\b/` ป้องกัน false positive

**P1 — Architecture flaws**
- Specialist → BOM: `specialistBriefs` ถูก pass ไปยัง `runBomAgent` ทั้งใน `lib/chat.js` และ `server.js`
- Discovery constraints injection: `[HARD CONSTRAINTS]` section เพิ่มใน solution system prompt แยกจาก userPrompt JSON
- FC SAN rule: bom.md มี rule บังคับ FC HBA + FC switch เมื่อ architecture ระบุ Fibre Channel
- Windows Server licensing: bom.md มี trigger condition + per-core calculation ชัดเจน
- Budget validation: `lib/budget.js` parse budget string → ตรวจ overrun ก่อน proposal ทั้งใน server.js + chat.js

**P2 — Hardware currency**
- solution.md: Dell current gen = R760/R7625 ชัดเจน ห้ามใช้ R750/Unity XT

**P3 — Missing presale knowledge (ทั้งหมดแก้แล้วใน Session นี้)**
- Growth trajectory: `vm_count_3yr` field เพิ่มใน discovery schema + prompt
- Existing infrastructure: `existing_infrastructure` object (switches, rack_power_kw, fiber_available) เพิ่มใน discovery schema + prompt
- Trade-off analysis: solution.md มี section บังคับ operational maturity + budget fit + migration complexity
- Support contract / annual cost: bom.md มี Support & Warranty section
- Free-text revision routing: `detectRevisionIntent` เพิ่ม `spec_update` intent สำหรับ "รุ่นล่าสุด", "อัพเดต spec" ฯลฯ

**Memory**
- บันทึก: Vendor price list / CPQ integration จะไม่ทำ — distributors ใช้ proprietary CPQ ของ vendor เท่านั้น BOM ออกแบบให้ไม่มีราคา intentionally

**Tests**: 19/19 pass ทุก session

### Pending

- P4 (systemic): proposal versioning, warranty/SLA in BOM (automated), decision audit trail, assumptions_applied downstream usage
- Milestone ใหม่: Orchestration redesign + validation gates + revision loop → **รอ real customer trigger ก่อน**

### Next Steps (เมื่อกลับมา)

1. ทดสอบ live run ด้วย real customer intake — ดู discovery output ว่า `vm_count_3yr` + `existing_infrastructure` ถูก extract ได้จริง
2. ตรวจ BOM output ว่า support & warranty note ถูก generate
3. ทดสอบ "รุ่นล่าสุด" revision flow ใน chat
4. ถ้า P4 ต้องการ → เริ่ม Milestone ใหม่ (Orchestration redesign)

---

## 2026-04-06 (Session 3)

### Done

- **KB Embed** — process Dell R760, PowerStore, PowerProtect DD, PowerVault ME5, Veeam, Proxmox datasheets → 523 chunks ใน Supabase (เดิม 37)
- **ลบ noisy chunks** — ลบ 130 chunks ที่มีแค่ "-- X of Y --" ออกจาก Supabase
- **Vendor-filtered retrieval** (`lib/supabase.js`) — เพิ่ม `retrieveKnowledgeByVendorFilter()` query ตาม source_key แทน semantic
- **BOM hybrid retrieval** (`agents/bom.js`) — ใช้ vendor-filter + vector combined (28 chunks Dell/Veeam/Proxmox)
- **Vendor preference extraction** (`lib/chat.js`) — scan จาก intake message + discovery reply + constraints ทั้งหมด, detect rejection patterns (ไม่เอา/avoid), block Nutanix auto-inject
- **Solution hard enforcement** (`agents/solution.js`) — เปลี่ยน "rank higher" → "HARD REQUIREMENT — MUST include, FAILURE if not"
- **BOM prompt rewrite** (`agents/_prompts/bom.md`) — Thai rule ขึ้นต้น + ท้าย, backup appliance section (DD/ME5), ตัวอย่าง DDR5
- **Solution prompt** — เพิ่ม backup storage architecture guidance + ลด Nutanix bias
- **ตัด assumptions section** ออกจาก chat summary
- **Multi-agent full audit** — พบ 41 issues (1 critical bug, 38 design flaws)

### Critical Bug พบแต่ยังไม่ได้แก้

**BUG-001 (CRITICAL)**: `agents/bom.js` — `vendorStack` ถูกใช้ใน try block ก่อนถูก define
```js
// ~line 156 (ใน try block):
const vendorChunks = await retrieveKnowledgeByVendorFilter(vendorStack, 4); // ❌ ReferenceError!

// ~line 179 (หลัง try block):
const vendorStack = selected?.vendor_stack ?? [];  // define ช้าเกินไป
```
ผลกระทบ: KB ไม่ถูก inject เข้า BOM ทุก run → LLM hallucinate spec ทั้งหมด

### Pending — 41 Issues ที่ต้องแก้ (เรียงตาม priority)

#### P0 — Fix ทันที (blocking)
1. **BUG-001**: Move `vendorStack` definition ก่อน try block ใน `agents/bom.js`
2. **MOCK contamination**: ลบ Nutanix hardcode จาก `buildMockSolution()` และ `MOCK_BRIEFS.syseng`
3. **isAiWorkload()**: แก้ regex ไม่ให้ match "ai" ใน substring ("availability" → false positive)

#### P1 — Architecture flaws (high impact)
4. **Specialist → BOM data flow**: ส่ง specialistBriefs ไปให้ BOM agent ด้วย (ปัจจุบัน BOM ไม่รู้ constraints จาก specialist)
5. **Budget validation**: เพิ่ม check estimated_tco_thb ≤ budget_range ก่อน generate proposal
6. **Discovery → solution constraint enforcement**: constraints array ต้องถูก inject แยกต่างหากใน solution prompt ไม่แค่ userPrompt JSON
7. **FC SAN completeness**: bom.md ต้องมี rule: ถ้า architecture ระบุ Fibre Channel → ต้องมี FC HBA + FC switch
8. **Windows Server licensing**: bom.md ต้องคำนวณ WS Datacenter per-core เมื่อ VM รัน Windows

#### P2 — Hardware currency
9. Solution prompt: เพิ่ม "Dell current gen = R760/R760xs (not R750), R7625 (not R7525), PowerStore T-series (not Unity XT)"
10. Specialist mock: ลบ R760xs recommendation ออก หรือเปลี่ยนเป็น generic

#### P3 — Missing presale knowledge
11. Discovery: เพิ่มคำถาม growth trajectory (VM count ใน 3 ปี)
12. Discovery: เพิ่มคำถาม existing infrastructure (switches, rack power, fiber)
13. Solution: เพิ่ม trade-off analysis section (operational maturity, budget fit)
14. BOM: เพิ่ม support contract / annual cost section
15. Free-text revision routing: "รุ่นล่าสุด", "update spec" ต้อง trigger revision intent

#### P4 — Systemic
16-41. ดู audit report ฉบับเต็มใน session

### Next Steps (เมื่อกลับมา)

1. แก้ BUG-001 ก่อนเลย (5 นาที, critical):
   ```js
   // agents/bom.js — move vendorStack definition ก่อน try block
   const vendorStack = selected?.vendor_stack ?? [];
   // then try { const vendorChunks = await retrieveKnowledgeByVendorFilter(vendorStack, 4); ... }
   ```

2. Fix mock contamination (Nutanix hardcode ใน buildMockSolution + MOCK_BRIEFS)

3. Fix isAiWorkload() regex

4. เพิ่ม specialistBriefs ไปที่ BOM agent

5. เลือก scope: แก้ทีละ P-level หรือ redesign orchestration layer ใหม่ทั้งหมด

---

## 2026-04-06 (Session 2)

### Done
- **BOM agent ใช้ RAG** (`agents/bom.js`)
- **แก้ vendor matching bug** (`lib/chat.js` → `handleAwaitingSelection`)

### Pending (resolved in Session 3)
- ทดสอบ BOM ใหม่ → ทำใน Session 3 แล้ว

---

## 2026-04-06 (Session 1)

### Done
- **UI Redesign — Light mode แบบ Claude** (ทั้ง 4 หน้า)
- **OpenAI model name แก้ไข** `.env`: `gpt-4.1-mini`

---

## 2026-04-05

### Done
- **Phase 7 — Discovery Agent + Classifier** — 53/53 tests pass
- **Phase 7.1 wired into chat state machine**

---

## 2026-04-08 (Session ปัจจุบัน)

### Done

**Week 1 Quick Wins — ครบทั้งหมด**
- งาน 3 Model Upgrade: gpt-5.4-mini (solution/bom), gpt-4.1-mini (discovery/specialist/proposal), เพิ่ม specialist model key แยกจาก solution
- งาน 1 Copy: login headline, subtitle, wordmark "AI Presale Co-pilot", empty-state + trust signal, urgency chips, placeholder, download button text
- งาน 2 UI Polish: message bubbles (user ขวา/terracotta, AI ซ้าย/white card), skeleton shimmer, hamburger sidebar mobile, send spinner, copy-to-clipboard, safe-area-inset-bottom
- งาน 4 Grounding Warning UI: red banner แทน silent markdown, return grounding_warnings count จาก API, Audit Trail tab ใน admin (GET /api/admin/audit + readAgentLogs)

**Bug Fix — Post-Solution Q&A (ระบบตอบคำถาม user หลังเสนอ solution)**
- openai.js: เพิ่ม generateTextWithOpenAI()
- chat.js: เพิ่ม isQuestion(), handleFreeformQA() ใช้ project context (requirements+solution+BOM) ตอบแบบ presale expert
- Routing: stage=complete → handleFreeformQA, stage=awaiting_selection + isQuestion → handleFreeformQA

**Bug Fix — Obsolete Model Prevention**
- bom.md: เพิ่ม HARD RULE section (KB-only model numbers, ถ้าไม่มีใน KB → "ยืนยัน model กับ distributor")
- bom.js: extract verified models จาก KB chunks → inject [VERIFIED MODELS IN KB] list เข้า prompt
- solution.md: เพิ่ม HARD RULE ห้าม commit model number นอก KB, ระบุ EoS list ที่ห้ามใช้

### Next Steps เมื่อกลับมา

1. ทดสอบ handleFreeformQA ด้วย live OpenAI key
2. ทดสอบ obsolete model fix: upload KB → run BOM → ตรวจไม่มี EoS model
3. เริ่ม Week 2: Role-Based Access (Admin/Manager/Engineer)

### Server
http://localhost:3000 — ทำงานอยู่
