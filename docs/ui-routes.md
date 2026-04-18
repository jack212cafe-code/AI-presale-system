# AI Presale System — UI Routes

**Production:** https://ai-presale-system.onrender.com
**Local dev:** http://localhost:3000

## หน้า UI ทั้งหมด

| URL (Production) | ไฟล์ | Auth | คำอธิบาย |
|---|---|---|---|
| https://ai-presale-system.onrender.com/ | `login/login.html` | - | หน้า login (root redirect) |
| https://ai-presale-system.onrender.com/login | `login/login.html` | - | หน้า login |
| https://ai-presale-system.onrender.com/signup | `signup/index.html` | - | สมัคร org + user ใหม่ (SI free trial) |
| https://ai-presale-system.onrender.com/chat | `chat/chat.html` | session cookie | Chat UI ใหม่ (Claude Design) — entry point หลัก |
| https://ai-presale-system.onrender.com/pipeline | `pipeline/pipeline.html` | ✅ server-side | รัน pipeline + ดู progress 4 stages |
| https://ai-presale-system.onrender.com/admin | `admin/index.html` | client-side JS | Admin: KB, audit, feedback, users (scope by org) |
| https://ai-presale-system.onrender.com/superadmin | `superadmin/index.html` | client-side JS | Superadmin: cross-org management |

## Static Assets

| URL | ไฟล์ |
|---|---|
| https://ai-presale-system.onrender.com/login/login.js | `login/login.js` |
| https://ai-presale-system.onrender.com/signup/signup.js | `signup/signup.js` |
| https://ai-presale-system.onrender.com/chat/chat.js | `chat/chat.js` |
| https://ai-presale-system.onrender.com/pipeline/pipeline.js | `pipeline/pipeline.js` |
| https://ai-presale-system.onrender.com/admin/admin.js | `admin/admin.js` |
| https://ai-presale-system.onrender.com/superadmin/superadmin.js | `superadmin/superadmin.js` |
| https://ai-presale-system.onrender.com/intake/submit.js | `intake/submit.js` |

## API Endpoints (JSON only — ไม่มี UI)

### Auth
- `POST /api/auth/login` — login (username, password)
- `POST /api/auth/logout` — logout
- `GET /api/auth/session` — check current session
- `POST /api/auth/signup` — สมัครใหม่

### Pipeline / Chat
- `POST /api/intake` — สร้าง project record
- `POST /api/intake/analyze` — intake + discovery
- `POST /api/solution` — รัน solution agent
- `POST /api/pipeline` — รัน full pipeline (discovery → solution → bom → proposal)
- `POST /api/chat` — chat streaming (SSE)
- `POST /api/tor` — TOR analysis (SSE)
- `GET /api/tor/:id/export` — download TOR compliance CSV

### Projects / Conversations
- `GET /api/projects` — list projects (scope by user + org)
- `GET /api/projects/:id/status` — project detail
- `GET /api/projects/:id/conversations` — conversations ของ project
- `GET /api/conversations/:id/messages` — messages ของ conversation
- `POST /api/projects/:id/approve` — approve (admin/manager)
- `POST /api/projects/:id/feedback` — feedback rating
- `POST /api/projects/:id/corrections` — correction (admin)
- `POST /api/preferences/vendor` — vendor preference

### Exports
- `GET /api/exports/:projectId/backup` — backup zip
- `GET /api/exports/:projectId/bom` — BOM CSV
- `GET /api/exports/:projectId/solution` — solution JSON
- `GET /api/exports/:projectId/spec` — spec docx
- `GET /api/exports/:projectId/proposal` — proposal docx

### Admin
- `GET /api/admin/audit` — audit log (scope by org)
- `GET /api/admin/feedback` — feedback summary (scope by org)
- `GET /api/admin/kb-docs` — KB documents list
- `POST /api/admin/kb-docs` — upload KB doc
- `GET /api/admin/users` — users list (scope by org)
- `POST /api/admin/users` — create user
- `PATCH /api/admin/users/:id` — update user
- `DELETE /api/admin/users/:id` — delete user

## Auth Flow

1. SI ไป https://ai-presale-system.onrender.com/signup → สมัคร org + user
2. หรือ login ที่ https://ai-presale-system.onrender.com/login
3. Server set cookie `ai_presale_session` (HttpOnly, SameSite=Lax, 30 วัน)
4. Cookie carry org_id → API filter ทุกตัวจะ scope ตาม org อัตโนมัติ
5. หลัง login → ไปหน้า `/chat` (entry point หลัก) หรือ `/pipeline`

## Known Issues

- `/intake` (`intake/index.html`) มีไฟล์แต่ **ไม่ได้ wire ใน `routes/static.js`** — เปิดไม่ได้ผ่าน browser (เข้าถึงได้แค่ผ่าน `/api/intake`)
- `chat-integrated/chat.html` ยังเป็น untracked (เก็บไว้สำหรับ redesign รอบถัดไป)
- `/admin` + `/superadmin` HTML serve โดยไม่ผ่าน `requireUserAuth` ที่ server (พึ่ง client JS) — API gate ด้วย auth ทุกตัว ก็ปลอดภัยพอ แต่ HTML ไม่ควร leak (ไม่มี secret อยู่ในนั้น)

## Source

- Static routing: `routes/static.js`
- Server entry: `server.js`
