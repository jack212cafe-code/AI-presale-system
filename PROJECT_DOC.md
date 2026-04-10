# AI Presale System — Project Documentation

**Version:** 1.1  
**Date:** 2026-04-08  
**Owner:** Pitsanu / VST ECS  

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Database Schema](#4-database-schema)
5. [Agent Pipeline](#5-agent-pipeline)
6. [API Reference](#6-api-reference)
7. [Environment Variables](#7-environment-variables)
8. [Knowledge Base](#8-knowledge-base)
9. [Validation Gates](#9-validation-gates)
10. [Admin User Manual](#10-admin-user-manual)
11. [User Guide (Presale Engineer)](#11-user-guide-presale-engineer)
12. [Local Development](#12-local-development)
13. [Deployment](#13-deployment)

---

## 1. System Overview

AI Presale System คือระบบ AI-native สำหรับงาน presale IT ที่ครอบคลุมโดเมน:

- **HCI** (Hyperconverged Infrastructure)
- **3-Tier** (Compute + Storage + Network แยก tier)
- **Backup & Recovery**
- **Disaster Recovery (DR)**
- **Cybersecurity**

ระบบทำงานเป็น one-person presale operation — รับ brief จากลูกค้า → สร้าง requirements → ออกแบบ solution → สร้าง BOM → สร้าง proposal document โดยอัตโนมัติผ่าน multi-agent pipeline

### Key Capabilities

| Capability | Description |
|---|---|
| Discovery Agent | ถามคำถาม clarifying จากลูกค้า, parse answers เป็น structured requirements |
| Specialist Agents | syseng / neteng / devops / ai_eng — ground-truth จาก Knowledge Base |
| Solution Design | สร้าง 2-3 solution options พร้อม vendor stack และ estimated TCO |
| BOM Generation | สร้าง Bill of Materials พร้อม grounding validation กับ KB |
| Proposal Document | สร้างไฟล์ .docx สำหรับส่งลูกค้า |
| Knowledge Base | Upload spec sheet → embed → inject เข้า agent ขณะ generate |
| Memory System | จำ vendor preference, prior rejected options, duplicate customer detection |
| Correction Loop | Admin log correction → push เข้า KB → agents เรียนรู้ |

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    FRONTEND CLIENTS                       │
│  /login      /intake (หน้าหลัก)    /chat    /admin      │
└──────────┬──────────────┬─────────────┬──────────────────┘
           │              │             │
    USER AUTH        PRESALE FLOW    ADMIN PORTAL
           │              │             │
┌──────────┴──────────────┴─────────────┴──────────────────┐
│                    server.js (HTTP API)                    │
│  /api/auth  /api/chat  /api/pipeline  /api/admin          │
└──────────┬──────────────┬─────────────┬──────────────────┘
           │              │             │
    ┌──────┴──────┐  ┌────┴──────┐  ┌──┴──────────────┐
    │  lib/chat.js│  │  Agents   │  │  Admin KB Mgmt  │
    │(orchestrator│  │ Pipeline  │  │  + Corrections  │
    └──────┬──────┘  └────┬──────┘  └──┬──────────────┘
           └──────────────┴─────────────┘
                          │
           ┌──────────────┴──────────────────────┐
           │         AGENT PIPELINE               │
           │                                      │
           │  Discovery → Specialist → Solution   │
           │              ↓                       │
           │            BOM → Proposal            │
           │                                      │
           │  + KB Retrieval (vector + keyword)   │
           │  + Grounding Validation              │
           │  + Budget Gate                       │
           │  + Vendor Memory                     │
           └──────────────┬──────────────────────┘
                          │
           ┌──────────────┴──────────────────────┐
           │         SUPABASE (PostgreSQL)        │
           │  projects  users  conversations      │
           │  messages  knowledge_base            │
           │  agent_logs  user_preferences        │
           │  corrections  pricing_catalog        │
           └──────────────────────────────────────┘
```

### Conversation Stage Machine

```
[new conversation]
       │
       ▼
  greeting
       │  (Discovery agent สร้างคำถาม)
       ▼
  discovery_questions
       │  (ตอบคำถาม → Gate 1 validation → Specialist + Solution)
       ▼
  awaiting_selection
       │  (เลือก option → Gate 2 grounding + budget → BOM + Proposal)
       ▼
  bom
       │  (proposal generated)
       ▼
  complete ──→ [revision loop: requirements / solution / vendor / spec_update]
```

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22+ (ESM modules) |
| HTTP Server | Node.js built-in `http` (no Express) |
| LLM | OpenAI Responses API (gpt-4.1-mini default) |
| Embedding | OpenAI text-embedding-3-small (1536 dims) |
| Database | Supabase (PostgreSQL + pgvector) |
| Document Generation | `docx` npm package |
| Authentication | Cookie-based sessions (in-memory + Supabase persistent) |
| Rate Limiting | In-memory sliding window (per-user, per-bucket) |
| File Storage | Local filesystem (`proposals/`, `knowledge_base/raw/uploads/`) |

---

## 4. Database Schema

### `projects`

| Column | Type | Description |
|---|---|---|
| id | uuid PK | Project ID |
| customer_name | text | ชื่อลูกค้า |
| status | text | discovery_complete / solution_complete / bom_complete / proposal_complete |
| intake_json | jsonb | Intake payload จาก user |
| requirements_json | jsonb | Output จาก Discovery Agent |
| solution_json | jsonb | Output จาก Solution Agent |
| bom_json | jsonb | Output จาก BOM Agent |
| proposal_url | text | Path ไปยังไฟล์ .docx |
| human_approved | boolean | ต้อง = true ก่อน proposal ถึงจะถูก generate |
| user_id | uuid | FK → users.id |
| created_at / updated_at | timestamptz | |

### `users`

| Column | Type | Description |
|---|---|---|
| id | uuid PK | |
| username | text UNIQUE | |
| password_hash | text | bcrypt hash |
| display_name | text | |
| created_at | timestamptz | |

### `sessions`

| Column | Type | Description |
|---|---|---|
| token | text PK | UUID session token |
| user_id | uuid | FK → users.id |
| display_name | text | ชื่อผู้ใช้ |
| role | text | admin / manager / engineer |
| created_at | bigint | Unix timestamp (ms) |
| expires_at | bigint | Unix timestamp (ms), TTL 30 วัน |

Session ถูก persist ลง Supabase และ load กลับมาเมื่อ server restart

### `conversations`

| Column | Type | Description |
|---|---|---|
| id | uuid PK | |
| project_id | uuid FK | |
| user_id | text | |
| stage | text | greeting / discovery_questions / awaiting_selection / bom / complete |
| created_at / updated_at | timestamptz | |

### `messages`

| Column | Type | Description |
|---|---|---|
| id | uuid PK | |
| conversation_id | uuid FK | |
| role | text | user / assistant |
| content | text | |
| created_at | timestamptz | |

### `knowledge_base`

| Column | Type | Description |
|---|---|---|
| id | uuid PK | |
| source_key | text UNIQUE | ชื่อไฟล์ + chunk index |
| category | text | taxonomy category |
| title | text | ชื่อเอกสาร |
| content | text | ข้อความ chunk |
| embedding | vector(1536) | OpenAI embedding |
| metadata | jsonb | vendor, product_family, document_type, trust_level, tags |
| created_at | timestamptz | |

### `agent_logs`

| Column | Type | Description |
|---|---|---|
| id | uuid PK | |
| project_id | uuid FK | |
| agent_name | text | discovery / solution / bom / proposal / specialist |
| model_used | text | OpenAI model name |
| tokens_used | int | Total tokens |
| cost_usd | numeric | คำนวณจาก token × rate |
| kb_chunks_injected | int | จำนวน KB chunks ที่ inject เข้า prompt |
| duration_ms | int | ระยะเวลา |
| status | text | success / error |
| input_json / output_json | jsonb | |
| created_at | timestamptz | |

### `corrections`

| Column | Type | Description |
|---|---|---|
| id | uuid PK | |
| project_id | uuid FK (nullable) | |
| field | text | ชื่อ field ที่ผิด (เช่น bom.description) |
| wrong_value | text | ค่าที่ agent generate ผิด |
| correct_value | text | ค่าที่ถูกต้อง |
| note | text | หมายเหตุเพิ่มเติม |
| created_at | timestamptz | |

### `user_preferences`

| Column | Type | Description |
|---|---|---|
| id | uuid PK | |
| user_id | text UNIQUE | |
| vendor_preferences | jsonb | `{preferred: ["Dell"], disliked: ["VMware"]}` |
| updated_at | timestamptz | |

---

## 5. Agent Pipeline

### Discovery Agent (`agents/discovery.js`)

**Input:** Intake payload  
**Modes:**
- `generate_questions` — ออกคำถาม clarifying ให้ลูกค้าตอบ
- `parse_answers` — แปลงคำตอบเป็น requirements JSON
- (ไม่ระบุ mode) — Full discovery รวดเดียว

**Output Schema:**
```json
{
  "category": "HCI|DR|Backup|Security|Full-stack",
  "customer_profile": { "name": "...", "industry": "...", "environment": "..." },
  "partner_context": { "partner_type": "...", "operating_model": "..." },
  "use_cases": ["HCI", "Backup & Recovery"],
  "pain_points": ["..."],
  "scale": {
    "users": 200,
    "vm_count": 50,
    "storage_tb": 20,
    "vm_count_3yr": 80
  },
  "existing_infrastructure": {
    "switches": "Cisco C9300",
    "rack_power_kw": 20,
    "fiber_available": true
  },
  "budget_range": "3,000,000-5,000,000 THB",
  "constraints": ["Dell preferred", "No VMware"],
  "gaps": ["..."],
  "assumptions_applied": ["..."]
}
```

### Specialist Agent (`agents/specialist.js`)

**Domains:** syseng / neteng / devops / ai_eng  
**KB Integration:** Vendor-filtered + vector-based retrieval per domain

| Domain | KB Keywords | Vector Query |
|---|---|---|
| syseng | poweredge, powerstore, powerscale, windows-server | compute HCI sizing |
| devops | veeam, powerprotect, powervault | backup repository |
| neteng | (none — vector only) | network switch 25GbE |
| ai_eng | dell (vendor filter) | GPU inference NVIDIA |

**Output:** specialist briefs array → inject เข้า solution agent system prompt

### Solution Agent (`agents/solution.js`)

**Input:** Requirements + specialist briefs  
**KB:** Vector retrieval top-5 chunks per use_case  
**Output:**
```json
{
  "options": [
    {
      "name": "Dell HCI with Veeam",
      "architecture": "HCI",
      "vendor_stack": ["Dell", "Veeam"],
      "rationale": ["..."],
      "risks": ["..."],
      "estimated_tco_thb": 4500000
    }
  ],
  "selected_option": 0
}
```

### BOM Agent (`agents/bom.js`)

**Input:** Solution (selected option) + requirements + specialist briefs  
**KB:** Hybrid — vendor-filter + vector  
**Post-processing:** `groundBom()` เพิ่ม GROUNDING WARNING rows สำหรับ model ที่ไม่อยู่ใน KB  
**Output:**
```json
{
  "rows": [
    {
      "category": "Compute",
      "description": "Dell PowerEdge R760 — 2x Xeon Gold 6430, 512GB DDR5",
      "qty": 3,
      "notes": "vSAN ready nodes"
    },
    {
      "category": "GROUNDING WARNING",
      "description": "R750 — model not found in Knowledge Base",
      "qty": 1,
      "notes": "GROUNDING WARNING"
    }
  ],
  "notes": ["Support & Warranty: Dell ProSupport Plus 3yr recommended"]
}
```

### Proposal Agent (`agents/proposal.js`)

**Input:** Intake + requirements + solution + BOM + budget warning  
**Output:** `.docx` file บันทึกใน `proposals/{project_id}.docx`  
**Critical Rule:** ไม่ generate ถ้า `human_approved = false`

---

## 6. API Reference

### Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /api/auth/login | None | Login ด้วย username/password → session cookie |
| POST | /api/auth/logout | User | Logout |
| GET | /api/auth/session | None | ตรวจ session ปัจจุบัน |

### Presale Pipeline

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /api/intake | User | สร้าง project จาก intake form |
| POST | /api/intake/analyze | User | สร้าง project + run discovery (one-shot) |
| POST | /api/pipeline | User | Full pipeline ตั้งแต่ต้นถึงจบ |
| POST | /api/solution | User | Run solution agent บน project ที่มีอยู่แล้ว |
| POST | /api/projects/:id/approve | User | Manual approval gate |

### Projects & Conversations

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/projects | User | รายการ projects ของ user |
| GET | /api/projects/:id/status | User | ดูรายละเอียด project |
| GET | /api/conversations/:id/messages | User | ดู message history |
| GET | /api/projects/:id/conversations | User | รายการ conversations ของ project |
| GET | /api/proposals/:id/download | User | Download proposal .docx |

### Chat Interface

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /api/chat | User | ส่ง message เข้า pipeline |

**Request Body:**
```json
{
  "conversation_id": "uuid (null สำหรับ conversation ใหม่)",
  "message": "ต้องการ HCI สำหรับ 50 VM..."
}
```

**Response:**
```json
{
  "conversation_id": "uuid",
  "project_id": "uuid",
  "stage": "discovery_questions|awaiting_selection|bom|complete",
  "text": "ข้อความตอบกลับ (Markdown)",
  "created": true|false
}
```

### Vendor Preferences

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /api/preferences/vendor | User | บันทึก vendor preference |

```json
{ "vendor": "Dell", "sentiment": "preferred|disliked" }
```

### Admin — Knowledge Base

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /api/admin/login | None | Admin login |
| POST | /api/admin/logout | Admin | Admin logout |
| GET | /api/admin/session | None | ตรวจ admin session |
| GET | /api/admin/kb/documents | Admin | รายการเอกสารใน KB |
| POST | /api/admin/kb/upload | Admin | Upload เอกสารใหม่ |
| DELETE | /api/admin/kb/documents | Admin | ลบเอกสาร |
| GET | /api/admin/kb/jobs/:id | Admin | ตรวจ import job status |

### Admin — Corrections

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /api/projects/:id/corrections | Admin | บันทึก correction |
| GET | /api/admin/corrections | Admin | รายการ corrections ล่าสุด |
| POST | /api/admin/corrections/aggregate | Admin | Push corrections เข้า KB |

---

## 7. Environment Variables

```env
# Server
PORT=3000
PUBLIC_BASE_URL=http://localhost:3000

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL_DISCOVERY=gpt-4.1-mini
OPENAI_MODEL_SOLUTION=gpt-4.1-mini
OPENAI_MODEL_BOM=gpt-4.1-mini
OPENAI_MODEL_PROPOSAL=gpt-4.1-mini

# Embedding
EMBEDDING_PROVIDER=openai
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# KB Import Limits
KB_IMPORT_MAX_FILE_SIZE_MB=30
KB_IMPORT_MAX_CHUNKS_PER_DOCUMENT=400
KB_IMPORT_EMBED_BATCH_SIZE=20
KB_IMPORT_UPSERT_BATCH_SIZE=100

# Admin Portal
ADMIN_PORTAL_PASSWORD=your-secure-password

# Rate Limiting
RATE_LIMIT_API_MAX=30                # max requests per window (general API)
RATE_LIMIT_API_WINDOW_MIN=1          # window size in minutes
RATE_LIMIT_PIPELINE_MAX=10           # max requests per window (heavy: chat/pipeline/tor)
RATE_LIMIT_PIPELINE_WINDOW_MIN=60    # window size in minutes

# Development
AI_PRESALE_FORCE_LOCAL=1  # skip Supabase/OpenAI, ใช้ mock data
```

---

## 8. Knowledge Base

### Supported File Types

| Format | Extension | Parser |
|---|---|---|
| PDF | .pdf | pdf-parse |
| Word | .docx | mammoth |
| Excel | .xlsx | xlsx |
| Markdown | .md | plain text |
| Text | .txt | plain text |
| JSON | .json | JSON.parse |
| CSV | .csv | plain text |

### Document Metadata Fields

| Field | Required | Description |
|---|---|---|
| title | Yes | ชื่อเอกสาร |
| vendor | Yes | Dell / HPE / Veeam / Nutanix / Cisco / Microsoft / etc. |
| product_family | No | PowerEdge / PowerStore / Veeam Data Platform / etc. |
| document_type | Yes | spec_sheet / whitepaper / datasheet / comparison_guide / user_guide |
| category | Yes | compute / storage / backup / network / security / hypervisor |
| revision_date | No | YYYY-MM-DD |
| trust_level | No | starter_seed / verified / authoritative |
| tags | No | comma-separated tags |

### Chunking Logic

- Max chunk size: **1,600 characters**
- Overlap: **200 characters** (preserve context across chunks)
- Source key format: `{filename}-chunk-{index:03d}`

### Retrieval Modes

| Mode | When Used | Description |
|---|---|---|
| Vector (semantic) | Solution agent, Specialist agent | OpenAI embedding → cosine similarity search |
| Vendor filter | BOM agent | Filter KB by vendor list, no embedding needed |
| Hybrid | BOM agent | Vendor filter + vector combined |
| Local fallback | No Supabase/OpenAI | Keyword search ใน seed/ files |

---

## 9. Validation Gates

### Gate 1 — Discovery → Solution

ตรวจสอบก่อนส่ง requirements เข้า solution pipeline:

| Check | Required | Message ถ้าขาด |
|---|---|---|
| category | Yes | "ประเภทงาน (HCI / Backup / DR / Security / Full-stack)" |
| scale.vm_count | Yes | "จำนวน VM ที่ต้องการ" |
| scale.storage_tb | Yes | "ขนาด storage ที่ต้องการ (TB)" |
| use_cases | Non-empty array | "Use case หลัก" |

หากขาด → ระบบถามกลับ, stage ยังคงเป็น `discovery_questions`

### Gate 2 — BOM → Proposal

ตรวจสอบหลัง BOM ก่อน approve + generate proposal:

| Check | Action |
|---|---|
| GROUNDING WARNING rows ใน BOM | แสดง warning list แยกจาก BOM table, ไม่ approve, ไม่สร้าง proposal |
| Budget overrun (TCO > budget upper) | แสดง warning พร้อม % overrun, ไม่ approve, ไม่สร้าง proposal |
| ไม่มีปัญหา | auto-approve project → generate proposal |

> GROUNDING WARNING rows จะไม่ปรากฏในตาราง BOM หรือใน DOCX — แสดงเป็น section แยกเท่านั้น

### Gate 3 — Proposal Security

- `human_approved = false` → proposal agent จะ throw error
- ใน chat flow: auto-approve เมื่อ Gate 2 ผ่าน
- ใน API pipeline: ต้อง call `POST /api/projects/:id/approve` ก่อน

---

## 10. Admin User Manual

### การเข้าสู่ระบบ Admin

1. ไปที่ URL: `http://your-server/admin`
2. กรอก **Admin Password** (ตั้งค่าผ่าน env `ADMIN_PORTAL_PASSWORD`)
3. คลิก **Login**

> Session หมดอายุใน 12 ชั่วโมง — ต้อง login ใหม่

---

### การจัดการ Knowledge Base (KB)

Knowledge Base คือฐานข้อมูลเอกสารทางเทคนิค (spec sheet, whitepaper) ที่ agents ใช้อ้างอิงขณะ generate BOM และ solution

#### การ Upload เอกสารใหม่

1. ไปที่ Section **Upload Document**
2. คลิก **Choose File** หรือ drag-drop ไฟล์
3. กรอกข้อมูล metadata:
   - **Title**: ชื่อเอกสาร (เช่น "Dell PowerEdge R760 Spec Sheet")
   - **Vendor**: เลือก vendor (Dell, HPE, Veeam, Nutanix, Cisco, Microsoft, ฯลฯ)
   - **Product Family**: รุ่นสินค้า (เช่น "PowerEdge", "PowerStore")
   - **Document Type**: spec_sheet / whitepaper / datasheet / comparison_guide
   - **Category**: compute / storage / backup / network / security
   - **Revision Date**: วันที่เอกสาร (YYYY-MM-DD)
   - **Trust Level**: starter_seed (ค่าเริ่มต้น) / verified / authoritative
   - **Tags**: tags เพิ่มเติม คั่นด้วย comma
4. คลิก **Upload**
5. ระบบจะแสดง **Import Job** — รอสักครู่ขณะ process

#### การตรวจสอบสถานะ Import

หลัง upload ระบบจะแสดง progress:
- `queued` → `processing` → `complete` (หรือ `failed`)
- ดู **Progress %** และ **Stage** (parsing / embedding / upserting)
- ถ้า `failed` → ดู error message และลองใหม่

#### การดูรายการเอกสาร

Section **Imported Documents** แสดง:
- ชื่อไฟล์, Title, Vendor, Document Type, Category, Tags
- **Chunk Count**: จำนวน chunks ที่ embed แล้ว (ยิ่งมาก = เอกสารยิ่งใหญ่)

#### การลบเอกสาร

1. หาเอกสารที่ต้องการลบใน Imported Documents
2. คลิก **Delete**
3. ยืนยัน — ระบบจะลบทุก chunk ของเอกสารนั้นออกจาก KB

> ⚠️ การลบไม่สามารถย้อนกลับได้ ต้อง upload ใหม่ถ้าต้องการ

---

### การ Log Correction (Feedback Loop)

เมื่อพบว่า agent generate ข้อมูลผิด ให้ log correction เพื่อให้ระบบเรียนรู้:

1. ไปที่ Section **Log Correction**
2. กรอกข้อมูล:
   - **Project ID** (optional): ใส่ UUID ของ project ที่พบปัญหา หรือปล่อยว่างสำหรับ general correction
   - **Field**: ชื่อ field ที่ผิด เช่น `bom.description`, `solution.vendor_stack`
   - **Wrong Value**: ค่าที่ agent generate มา (ผิด) เช่น "PowerStore T40"
   - **Correct Value**: ค่าที่ถูกต้อง เช่น "PowerStore 1200T"
   - **Note**: รายละเอียดเพิ่มเติม เช่น "T40 ไม่มีใน product line ปัจจุบัน"
3. คลิก **Log Correction**

#### การ Push Corrections เข้า KB

เมื่อ log correction หลายรายการแล้ว:
1. คลิก **Push to KB** ใน Section Recent Corrections
2. ระบบจะ aggregate corrections ที่มี field เดียวกัน → สร้าง synthetic KB entry
3. ครั้งหน้าที่ agent run จะได้รับ knowledge นี้ผ่าน retrieval

---

### Correction Best Practices

| สถานการณ์ | Field แนะนำ | ตัวอย่าง |
|---|---|---|
| Agent ใช้ model รุ่นเก่า | bom.description | Wrong: R750, Correct: R760 |
| Agent เดา spec ผิด | bom.description | Wrong: "128GB RAM", Correct: "256GB DDR5" |
| Windows licensing ผิด | bom.licensing | Wrong: "Standard 16-core", Correct: "Datacenter 16-core" |
| FC switch หาย | bom.missing_component | Wrong: "ไม่มี FC switch", Correct: "ต้องมี Cisco MDS 9132T" |
| Vendor stack ผิด | solution.vendor_stack | Wrong: "Nutanix", Correct: "Dell VxRail" |

---

### KB Coverage Check

ระบบตรวจสอบ KB coverage ทุกครั้งที่ server start:
- ถ้า vendor ใด (Dell, HPE, Veeam, Microsoft) ไม่มี spec sheet ใน KB → log warning
- ดู server logs สำหรับ `[kb-coverage] WARNING`

**Recommended KB Documents (Minimum):**
- Dell PowerEdge R760 Spec Sheet
- Dell PowerStore Gen2 Spec Sheet
- Dell PowerProtect Data Domain Spec Sheet
- Dell PowerVault ME52xx Spec Sheet
- Dell PowerScale Hybrid Nodes Spec Sheet
- Veeam Data Platform Feature Comparison
- Windows Server 2025 Comparison Guide

---

### Admin Troubleshooting

| ปัญหา | สาเหตุที่เป็นไปได้ | วิธีแก้ |
|---|---|---|
| Upload failed | ไฟล์ใหญ่เกิน 30MB | ลด KB_IMPORT_MAX_FILE_SIZE_MB หรือแยกไฟล์ |
| Import job stuck ที่ "processing" | OpenAI API rate limit | รอ 1-2 นาที แล้วลองใหม่ |
| Chunk count = 0 หลัง import | PDF scanned (image-based) | ใช้ PDF ที่ searchable text เท่านั้น |
| GROUNDING WARNING ทุก run | KB ไม่มี model ที่ agent generate | Upload spec sheet ของ vendor/model นั้น |
| Agent ไม่ใช้ KB (kb_chunks_injected=0) | Vector retrieval ล้มเหลว | ตรวจ SUPABASE_URL และ OPENAI_API_KEY |

---

## 11. User Guide (Presale Engineer)

### การเริ่มต้น Presale ใหม่

1. ไปที่ `http://your-server/` (Intake หน้าหลัก)
2. Login ด้วย username/password ที่ได้รับ
3. พิมพ์ brief จากลูกค้าในช่อง chat:
   ```
   ต้องการ HCI สำหรับโรงพยาบาลเอกชน 50 VM, storage 30TB, งบ 5M บาท
   ```
4. ระบบจะถามคำถาม clarifying — ตอบให้ครบ
5. ระบบแสดง solution options → เลือกหมายเลข (1, 2, 3)
6. ระบบ generate BOM + Proposal
7. Download proposal จากลิงก์ที่แสดง

### Revision Commands

หลัง proposal สร้างแล้ว สามารถพิมพ์:

| คำสั่ง | ผล |
|---|---|
| "เปลี่ยน vendor เป็น HPE" | Re-run solution ด้วย HPE preference |
| "ขอ solution ใหม่" | แสดง options ให้เลือกใหม่ |
| "รุ่นล่าสุด" / "อัพเดต spec" | Re-run ด้วย constraint ให้ใช้ current gen hardware |
| "ปรับ requirement" | กลับไป discovery_questions ขั้นตอนใหม่ |

### การตั้ง Vendor Preference (ถาวร)

ใน sidebar มีปุ่ม Vendor Preference:
- **Preferred**: Dell, HPE, Cisco ฯลฯ → agents จะ prioritize vendor นี้ทุก project
- **Disliked**: VMware ฯลฯ → agents จะหลีกเลี่ยง

---

## 12. Local Development

```bash
# Clone & install
git clone <repo>
cd ai-presale-system
npm install

# Environment
cp .env.example .env
# แก้ไข .env ใส่ API keys

# Run in local mode (no external services)
AI_PRESALE_FORCE_LOCAL=1 npm start

# Run with full integration
npm start

# Tests
npm test
```

### Local Mode

เมื่อ `AI_PRESALE_FORCE_LOCAL=1`:
- ไม่ต้องใช้ Supabase หรือ OpenAI
- Agents ใช้ mock responses
- KB retrieval ใช้ keyword search จาก `knowledge_base/seed/`
- Sessions ใช้ hardcoded users (user1-user5 / pass1234)

### Test Suite

```bash
npm test        # รัน test ทั้งหมด
```

ปัจจุบัน: **83/83 tests pass** (unit + integration)

---

## 13. Deployment

### Railway (Recommended)

ดู `railway.toml` สำหรับ configuration:
```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "node server.js"
```

**Environment Variables ที่ต้องตั้งใน Railway:**
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- OPENAI_API_KEY
- ADMIN_PORTAL_PASSWORD
- PUBLIC_BASE_URL

### Supabase Migrations

Apply migrations ตามลำดับใน Supabase SQL Editor:
```
supabase/migrations/01_*.sql
supabase/migrations/02_*.sql
...
supabase/migrations/10_corrections.sql
supabase/migrations/11_sessions.sql    ← session persistence
```

### Health Check

```
GET /health
→ { "status": "ok", "mode": "local|live", "timestamp": "..." }
```

---

## Appendix — Critical Rules

1. **ห้าม send proposal ถ้า `human_approved = false`** — enforced ทั้งใน agent และ API
2. **Log ทุก LLM call เข้า `agent_logs`** — ดู cost_usd + kb_chunks_injected
3. **Validate JSON output ก่อน write เข้า Supabase** — ใช้ `lib/validation.js`
4. **Prompts อยู่ใน `agents/_prompts/*.md` เท่านั้น** — ห้าม hardcode ใน .js
5. **Rate limit ทุก pipeline endpoint** — ป้องกันค่า OpenAI บาน, config ผ่าน ENV
6. **DOCX ต้องมี sign-off table** — Presale Engineer + Sales Manager ลงชื่อก่อนส่งลูกค้า
7. **GROUNDING WARNING ห้ามอยู่ใน DOCX** — filter ออกก่อน generate, แสดงใน chat เท่านั้น

---

## Changelog

### v1.1 (2026-04-08)

**BOM Pipeline Bug Fixes:**
- (P0) แก้ approval reset ใน `persistProposalMetadata()` — ไม่ set `human_approved: false` อีกต่อไป
- (P1) Filter GROUNDING WARNING rows ออกจาก DOCX proposal
- (P2) แก้ NaN ใน BOM qty sanitization
- (P2) Log KB retrieval failures แทน silent catch
- (P2) แก้ grounding warning แสดงซ้ำ + skip proposal เมื่อมี blockers
- (P3) ปรับ model regex ให้จับ lowercase/short-digit models
- (P3) เพิ่ม error handling ใน loadPrompt()
- (P3) Simplify Gate 1 scale logic

**Go-Live Features (Phase 1):**
- Rate limiting — in-memory sliding window, per-user per-bucket (lib/rate-limit.js)
- Session persistence — Supabase `sessions` table, auto-restore on restart
- HTML 404 error page (ไม่ใช่ JSON สำหรับ browser)
- DOCX polish: header/footer ทุกหน้า, page numbers, sign-off table, confidentiality notice, document metadata
- Scope messaging: badges ใน chat UI แสดง domain ที่รองรับ (Server, Storage, Backup, Dell/HPE/Lenovo/Veeam)
5. **Top-5 KB chunks สำหรับ solution design** — ห้ามลด match count ลงกว่านี้
6. **BOM และ Proposal ต้องใช้ deterministic settings** (temperature=0)
7. **BOM ไม่มีราคา** — distributors ใช้ proprietary CPQ เท่านั้น

---

*เอกสารนี้ถูกสร้างจาก codebase ณ 2026-04-06 — อัพเดตเมื่อมีการเปลี่ยนแปลง schema หรือ pipeline สำคัญ*
