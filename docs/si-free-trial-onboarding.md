# SI Free Trial Onboarding

**Beta — draft generator สำหรับ presale. ต้อง human-review เสมอ ห้ามส่งลูกค้าตรง**

Date issued: 2026-04-18
Duration: 4 สัปดาห์ (ถึง 2026-05-16) — renewable
Contact: jack212cafe@gmail.com

---

## 1. URLs

| Purpose | URL |
|---|---|
| Production | https://ai-presale-system.onrender.com |
| Login | https://ai-presale-system.onrender.com/login |
| Chat (entry point) | https://ai-presale-system.onrender.com/chat |
| Pipeline monitor | https://ai-presale-system.onrender.com/pipeline |
| Admin console | https://ai-presale-system.onrender.com/admin |

**ห้ามใช้ `/signup`** — ใช้ credentials ที่ได้รับด้านล่างเท่านั้น

---

## 2. Credentials

| SI | Username | Password | Role |
|---|---|---|---|
| SI Alpha | `si_alpha_admin` | `SiAlpha!2026` | admin |
| SI Bravo | `si_bravo_admin` | `SiBravo!2026` | admin |
| SI Charlie | `si_charlie_admin` | `SiCharlie!2026` | admin |

เปลี่ยนรหัสผ่านครั้งแรกได้ที่หน้า `/admin` → Users (หรือแจ้ง support)

เพิ่มผู้ใช้ในทีม: `/admin` → Users → Add (role = `engineer` / `manager` / `admin`)

---

## 3. Quick Start (5 นาที)

1. เข้า `/login` → ใส่ credentials
2. หน้า `/chat` → สร้าง project ใหม่: พิมพ์ข้อมูลลูกค้า + workload + scale (users, VMs, storage TB)
3. AI ถาม clarify → ตอบหรือกด skip
4. รอ pipeline วิ่ง: Discovery → Solution → BOM → Proposal (~2–5 นาที)
5. ที่ `/pipeline` → กด Resume ถ้ามีบาง stage ค้าง
6. Approve project ก่อนส่งลูกค้า (`projects.human_approved = true`)
7. Download: Proposal docx, BOM CSV, Solution JSON, Spec docx

---

## 4. Scope & Limits

**ทำได้:**
- Server / Storage / SAN / NAS / Object / HCI / 3-Tier
- Backup & Recovery / DR
- Cybersecurity (baseline)
- Output: solution design + BOM draft + proposal docx

**ยังไม่ทำ/จำกัด:**
- ราคา distributor จริง → ใช้ CPQ vendor คู่กันเสมอ
- Compliance/regulatory mapping → ให้ระบุเองใน proposal
- Sizing เป็น rule-of-thumb (Wave 2 จะเพิ่ม workload-based calc)
- Network/DR design เป็น skeleton (Wave 3 จะขยาย)
- Migration + ops runbook (Wave 4)

**Quota (free trial tier = entry):**
- Project: ตามโควต้า free-tier ที่ตั้งไว้ (admin bypass)
- LLM calls: logged ใน `agent_logs` ทุกครั้ง

---

## 5. Disclaimer — อ่านก่อนใช้งาน

1. ระบบอยู่ใน **beta** — output เป็น **draft** เท่านั้น
2. **ห้ามส่ง proposal ให้ลูกค้าโดยไม่ผ่าน senior presale review**
3. BOM/pricing ต้อง cross-check กับ CPQ vendor เสมอ
4. Sizing/licensing/network เป็น starting point — ไม่ใช่คำตอบสุดท้าย
5. ผู้ใช้รับผิดชอบ output ทุกอย่างที่ส่งถึงลูกค้า

---

## 6. Feedback Channel

- Email: jack212cafe@gmail.com (subject: `[SI Trial Feedback] <SI name>`)
- แจ้ง hallucination, wrong sizing, wrong SKU, missing feature
- แจ้ง weekly ก็ได้ (รวบรวมหลายเคสใน email เดียว)

ข้อมูล feedback ที่อยากได้:
- Project ID + screenshot/docx ที่มีปัญหา
- Expected vs actual
- Vendor/model ที่หายหรือผิด
- Severity: blocker / major / minor

---

## 7. Roadmap ที่จะเปิดให้ใช้ถัดไป

| Wave | Feature | ETA |
|---|---|---|
| Wave 1 | KB grounding tighter + `why_this_over_alternatives` | week 1–2 |
| Wave 2 | Workload-based sizing + license calculator | week 2–4 |
| Wave 3 | Network VLAN plan + DR bandwidth calc | week 4–6 |
| Wave 4 | Migration plan + ops runbook | week 6–7 |

---

## 8. Known Issues

- `/intake` ไม่มี UI route — เข้าถึงได้แค่ผ่าน chat
- Admin/superadmin HTML ไม่ผ่าน server-side auth (API ผ่าน) — อย่า bookmark path ตรง
- First signup เคยได้ role=engineer → แก้แล้ว deploy `a9f9586` (เจ้าของ org เป็น admin)

---

## Sources

- UI routes: `docs/ui-routes.md`
- Final Destination Plan: `/home/pitsanu/.claude/plans/final-destination-plan.md`
- Auth flow: `routes/auth.js`, `lib/user-auth.js`
