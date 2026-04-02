# Phase 4: Chat UI Frontend - Context

**Gathered:** 2026-03-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a browser chat interface at `/chat` that connects to the existing POST /api/chat backend. Users log in, type a brief in Thai/English, and receive solution options, BOM table, and a DOCX download link — all inline in the conversation thread.

No backend agent changes. No streaming. No mobile-specific layout. No SSE.

Exit criteria: Team member opens browser, logs in, types Thai brief, receives solution + BOM table + download link without leaving the chat.

</domain>

<decisions>
## Implementation Decisions

### App structure / routing
- **D-01:** New `chat/` folder served at `/chat` — separate from `intake/` which stays as-is (legacy)
- **D-01b:** New `login/` folder (or inline `/login` route) for unauthenticated users — same inline panel pattern as `admin/index.html`
- **D-01c:** `/chat` checks session on load; if not authenticated, redirects to `/login`
- **D-01d:** After login, redirect back to `/chat`

### Design language
- **D-02:** Warm cream palette — same CSS variables as `intake/index.html` (`--bg: #f6f2ea`, `--surface`, `--ink`, `--accent`, etc.)
- **D-02b:** Full-height app layout (100vh) — sidebar left + main right, no hero/centered-card style
- **D-02c:** Sidebar: ~240px fixed width, cream background, project list + "New Chat" button at top
- **D-02d:** Main area: message thread (scrollable) + fixed input bar at bottom

### Solution selection UX
- **D-03:** Solution options rendered as individual cards in the message thread
- **D-03b:** Each card has a "เลือกตัวเลือกนี้" button — clicking it programmatically sends the selection message (e.g., "เลือกตัวเลือกที่ 1") to POST /api/chat — no manual typing required
- **D-03c:** After selection, cards become non-interactive (button disabled/hidden)

### Loading experience
- **D-04:** While waiting for POST /api/chat response, show an assistant bubble with animated typing dots (`●●●`) and a rotating stage label
- **D-04b:** Stage label sequence (timed, not real-time): "กำลังวิเคราะห์ความต้องการ..." → "กำลังออกแบบโซลูชัน..." → "กำลังสร้าง BOM..." → "กำลังเขียน proposal..." — rotate every ~8s
- **D-04c:** Input bar disabled during loading (prevent double-submit)

### Proposal download
- **D-05:** Add `GET /api/proposals/:projectId/download` endpoint to `server.js` — auth required, reads `proposal_path` from projects table, streams file with `Content-Disposition: attachment`
- **D-05b:** Chat UI renders a download button/link in the message thread when stage = proposal complete

### Markdown rendering (Claude's Discretion)
- **D-06:** Use `marked.js` from CDN for markdown → HTML rendering of assistant messages
- **D-06b:** Sanitize output with `DOMPurify` (CDN) to prevent XSS
- **D-06c:** BOM tables rendered via markdown table syntax (already returned by agents as markdown)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Backend API contract
- `lib/chat.js` — `handleChatMessage(body, userId)` — returns `{ text, project_id, conversation_id, stage }`
- `server.js` lines ~497-530 — POST /api/chat route, auth middleware, response shape
- `.planning/phases/03-chat-backend/03-CONTEXT.md` §D-04 to D-09 — API contract: synchronous response, markdown text field, project_id on first message, conversation_id for subsequent messages

### Existing frontend patterns
- `intake/index.html` — CSS variables, design tokens, card/surface patterns to reuse
- `admin/index.html` — Login panel + portal layout toggle pattern (replicate for chat login check)
- `admin/admin.js` — Session check on load (`/api/admin/session`), `setPortalVisibility()` pattern

### Auth endpoints
- `server.js` — POST /api/auth/login, POST /api/auth/logout, GET /api/auth/session (Phase 2)
- `.planning/phases/02-user-authentication/02-CONTEXT.md` §D-01 to D-03 — Cookie name `ai_presale_session`, SameSite=Lax, HttpOnly

### Server static file serving
- `server.js` lines ~135-155 — `serveFile()` pattern — add routes for `/chat`, `/login`, `/chat/chat.js`

### Requirements
- `.planning/REQUIREMENTS.md` §M2 — Chat UI acceptance criteria
- `.planning/REQUIREMENTS.md` §M4 — Cross-session project history (sidebar project list)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `intake/index.html`: All CSS variables + utility classes — copy `:root` block verbatim into `chat/chat.html`
- `admin/admin.js`: `escapeHtml()`, `setPortalVisibility()`, session check fetch pattern — reuse in `chat/chat.js`
- `admin/admin.js`: Login form submit → POST /api/auth/login → toggle visibility pattern

### Established Patterns
- Vanilla HTML/CSS/JS — no build step, no framework, no bundler
- ESM not used in frontend (plain `<script>` tags)
- Server routes static JS files explicitly (e.g., `/intake/submit.js` → `intake/submit.js`)
- All API calls use `fetch()` with `credentials: 'include'` for session cookies

### Integration Points
- `server.js`: Add GET `/chat`, GET `/login`, GET `/chat/chat.js`, GET `/login/login.js` static routes
- `server.js`: Add GET `/api/proposals/:projectId/download` endpoint
- POST /api/chat — existing endpoint, just needs a frontend to call it

</code_context>

<specifics>
## Specific Ideas

- Login flow mirrors admin portal exactly: check session on load → show login form if unauthenticated → after login redirect to `/chat`
- First message from user creates project+conversation automatically (backend handles this per D-07/D-08 in Phase 3 context) — frontend just uses the returned `project_id` and `conversation_id`
- Sidebar project list: fetch GET /api/projects on load, show project name + date, click to load conversation history
- "New Chat" button clears thread and resets `conversation_id` to null (next send creates new project)

</specifics>

<deferred>
## Deferred Ideas

- Streaming / SSE responses — Phase 3 context confirmed "later for v2"
- Mobile responsive layout — not in scope this milestone
- Typing indicator that reflects real pipeline progress (would require SSE) — deferred
- Edit/delete messages — out of scope
- Export conversation as PDF — backlog

</deferred>

---

*Phase: 04-chat-ui-frontend*
*Context gathered: 2026-03-31*
