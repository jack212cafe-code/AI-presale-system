# Session Log

## 2026-04-17 14:08

### Presale Quality Improvement — COMPLETED

**Commit:** `648964c` — "feat: improve presale output quality — Thai narrative explanations + better extraction"

#### Done:
- ✅ Discovery: เพิ่ม rtorpo field ใน schema + prompt (RTO/RPO extraction จาก free text)
- ✅ Solution: เพิ่ม thai_narrative — Thai prose อธิบาย architecture + trade-off + risks
- ✅ BOM: เพิ่ม thai_explanations[] — per-row Thai explanation ของ sizing
- ✅ Diagram: เพิ่ม thai_explanation + prefer latest-gen (Dell 17G R670/R770) + NIC mismatch warning

#### Files changed (11 files, +73 -350 lines):
- agents/discovery.js, agents/_prompts/discovery.md
- agents/solution.js, agents/_prompts/solution.md
- agents/bom.js, agents/_prompts/bom.md
- agents/_prompts/diagram-generator.md, lib/diagram-generator.js
- lib/chat.js, routes/chat.js

#### Next:
- Deploy → Test ด้วย LLM Logistics case (20VM, 20TB, 15%, 2-5M, 10G switch, RTO/RPO 2hr)
- Verify TCO ใกล้ 3-5M (ไม่ใช่ 450K)

---

## 2026-04-17 13:00

### Fix: orgId not passed to handleGreeting

**Commit:** `e914687` — handleGreeting ไม่ได้รับ orgId ทำให้ greeting สร้าง conversation ที่มี org_id=null แม้ว่า user จะมี orgId

---

## 2026-04-17 12:30

### Fix: conversation org_id null blocking access

**Commit:** `2d5d8d9` — conversation ที่มี org_id=null ถูก block ผิดๆ แก้ให้ allow ถ้า conversation.org_id=null
