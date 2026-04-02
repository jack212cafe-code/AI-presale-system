# Phase 04: chat-ui-frontend — Research

**Researched:** 2026-03-31
**Domain:** Vanilla HTML/CSS/JS chat interface, markdown rendering, session-aware SPA
**Confidence:** HIGH

## Summary

Phase 04 builds a full-height browser chat UI at `/chat` using only vanilla HTML/CSS/JS — no build step, no bundler, no framework. The backend (POST /api/chat, GET /api/auth/session, GET /api/projects) is fully implemented from Phase 03. The frontend must handle a synchronous API that can take 8-30 seconds, render markdown BOM tables via marked.js + DOMPurify from CDN, and display solution options as interactive cards.

The existing codebase provides two strong reference patterns: `intake/index.html` (CSS variables, bubble/thread design) and `admin/admin.js` (session-check-on-load, `setPortalVisibility()`, `apiFetch()` wrapper). Both must be replicated, not reinvented. The chat page is a structural upgrade to a full-height app shell — sidebar + scrollable thread + fixed input bar — which requires specific CSS to avoid the classic full-height flexbox trap.

The most non-obvious problem is the loading UX for 8-30 second synchronous requests. The decided approach (rotating stage labels via `setInterval`) is correct and safe; the main pitfall is forgetting to clear the interval on success/error. Scroll-to-bottom on new messages must use `scrollTop = scrollHeight` inside a `requestAnimationFrame` callback (not `scrollIntoView`) to prevent jank when the thread container has `overflow: auto`.

**Primary recommendation:** Build chat/chat.html + chat/chat.js + login/login.html + login/login.js following admin.js patterns exactly. Load marked.js and DOMPurify from jsDelivr CDN with pinned versions and SRI hashes. Use CSS grid/flex for the full-height layout. All styling from intake/index.html's `:root` block.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** New `chat/` folder served at `/chat` — separate from `intake/` (legacy stays)
- **D-01b:** New `login/` folder for unauthenticated users — same inline panel pattern as `admin/index.html`
- **D-01c:** `/chat` checks session on load; if not authenticated, redirects to `/login`
- **D-01d:** After login, redirect back to `/chat`
- **D-02:** Warm cream palette — same CSS variables as `intake/index.html`
- **D-02b:** Full-height app layout (100vh) — sidebar left + main right
- **D-02c:** Sidebar ~240px fixed width, cream background, project list + "New Chat" button
- **D-02d:** Main area: scrollable message thread + fixed input bar at bottom
- **D-03:** Solution options rendered as individual cards in the message thread
- **D-03b:** "เลือกตัวเลือกนี้" button programmatically sends selection to POST /api/chat
- **D-03c:** After selection, cards become non-interactive (button disabled/hidden)
- **D-04:** Loading bubble with animated typing dots + rotating stage label
- **D-04b:** Stage label sequence, rotate every ~8s: "กำลังวิเคราะห์ความต้องการ..." → "กำลังออกแบบโซลูชัน..." → "กำลังสร้าง BOM..." → "กำลังเขียน proposal..."
- **D-04c:** Input bar disabled during loading (prevent double-submit)
- **D-05:** Add `GET /api/proposals/:projectId/download` endpoint to server.js
- **D-05b:** Chat UI renders download button when stage = complete
- **D-06:** Use `marked.js` from CDN for markdown rendering
- **D-06b:** Sanitize with DOMPurify (CDN)
- **D-06c:** BOM tables rendered via markdown table syntax

### Claude's Discretion

- Markdown rendering library choice confirmed as marked.js + DOMPurify (CDN)

### Deferred Ideas (OUT OF SCOPE)

- Streaming / SSE responses
- Mobile responsive layout
- Typing indicator reflecting real pipeline progress (requires SSE)
- Edit/delete messages
- Export conversation as PDF
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| M2 | Chat interface: input, thread, assistant replies, multi-turn | Full-height layout patterns, scroll behavior |
| M2 | Thai/English input accepted | No special handling needed; browser textarea supports both |
| M2 | Shows solution options, BOM table, download link inline | Card rendering pattern, marked.js table support |
| M3 | Login with username/password, sessions persist | admin.js session-check-on-load pattern |
| M4 | List of past projects, click to load conversation | GET /api/projects + conversation history fetch |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| marked.js | 17.0.5 | Markdown → HTML (BOM tables, headers, bold) | Decided in CONTEXT.md D-06; most-used MD renderer |
| DOMPurify | 3.3.3 | XSS sanitization of marked output | Standard pairing with marked; required before innerHTML |
| Vanilla JS | ES2020+ (Node 24 target) | All logic — no framework | Project constraint: no build step |

**Version verification (npm registry, 2026-03-31):**
- `marked`: 17.0.5 (latest)
- `dompurify`: 3.3.3 (latest)

### CDN URLs (pinned, jsDelivr)

```html
<!-- marked.js UMD build — exposes window.marked -->
<script src="https://cdn.jsdelivr.net/npm/marked@17.0.5/lib/marked.umd.js"
        crossorigin="anonymous"></script>

<!-- DOMPurify UMD build — exposes window.DOMPurify -->
<script src="https://cdn.jsdelivr.net/npm/dompurify@3.3.3/dist/purify.min.js"
        crossorigin="anonymous"></script>
```

**SRI hashes:** jsDelivr generates SRI hashes dynamically for pinned versions. Use jsDelivr's "Copy with SRI" button at https://www.jsdelivr.com/package/npm/marked?version=17.0.5 and https://www.jsdelivr.com/package/npm/dompurify?version=3.3.3 to get current `integrity=` values before committing.

**Why not minified marked:** `marked.umd.js` is the UMD browser-compatible build. The dist/ folder for marked@17 does not contain a `marked.min.js` — the UMD file at `lib/marked.umd.js` is the correct browser target.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None | — | No additional CDN libraries needed | Project is vanilla by constraint |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| marked.js | markdown-it | More plugins, heavier; marked is simpler for this use case |
| DOMPurify | manual escaping | DOMPurify handles edge cases (data: URIs, SVG); never hand-roll |

**Installation:** No npm install needed for CDN libraries. Add static route in server.js per existing pattern.

---

## Architecture Patterns

### Recommended Project Structure

```
chat/
├── chat.html        # Full-height app shell (sidebar + main)
└── chat.js          # All chat logic: session, fetch, render, scroll

login/
├── login.html       # Login form panel (mirrors admin/index.html pattern)
└── login.js         # Session check + POST /api/auth/login

server.js            # Add 4 GET routes + 1 GET /api/proposals/:id/download
```

### Pattern 1: Session Check on Load (from admin.js)

**What:** On page load, call GET /api/auth/session. Show login panel if unauthenticated, main app if authenticated.

**When to use:** Both chat.js and login.js use this.

```javascript
// Source: admin/admin.js lines 182-207 (syncSession pattern)
async function syncSession() {
  const { response, payload } = await apiFetch('/api/auth/session', { method: 'GET' });
  if (!response.ok || !payload.authenticated) {
    window.location.replace('/login');
    return;
  }
  // proceed to load chat
  await loadProjects();
}
```

**Note:** `/chat` redirects to `/login` on failure (not toggle visibility). Login page redirects to `/chat` on success. This differs from admin pattern (which toggles panels in-page).

### Pattern 2: Full-Height Chat Layout (CSS)

**What:** sidebar + main column, main = thread + input bar. Thread scrolls; input bar stays fixed at bottom.

**When to use:** chat.html body layout.

```css
/* Source: verified pattern — CSS grid full-height */
body { margin: 0; height: 100vh; display: flex; overflow: hidden; }

.sidebar {
  width: 240px;
  flex-shrink: 0;
  height: 100vh;
  overflow-y: auto;
  background: var(--bg);
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
}

.main {
  flex: 1;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.thread {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.composer {
  flex-shrink: 0;
  border-top: 1px solid var(--line);
  padding: 14px 20px;
  background: var(--surface);
}
```

**Critical:** `overflow: hidden` on `.main` is required. Without it, `flex: 1` on `.thread` does not cap the thread at viewport height — it bleeds past 100vh and the input bar scrolls off-screen.

### Pattern 3: Scroll-to-Bottom on New Message

**What:** After appending a message bubble to the thread, scroll the thread to its bottom.

**When to use:** Every time a user or assistant message is added.

```javascript
// Source: browser scroll API — verified pattern
function scrollToBottom(threadEl) {
  requestAnimationFrame(() => {
    threadEl.scrollTop = threadEl.scrollHeight;
  });
}
```

**Why `requestAnimationFrame`:** The new DOM node's height is not yet computed when the JS runs synchronously. `rAF` defers until after layout paint, ensuring `scrollHeight` reflects the new bubble. Using `scrollIntoView()` on the last message works but can cause layout shifts if the bubble has animation; `scrollTop = scrollHeight` is more predictable.

**Keep position when loading history:** When loading a past conversation, do NOT auto-scroll — the user wants to see the beginning or a specific point. Only auto-scroll when a new message arrives in the active conversation.

### Pattern 4: Rotating Stage Labels During Loading

**What:** While awaiting POST /api/chat (which may take 8-30s), show animated typing dots + rotating stage label.

**When to use:** Replace input bar content with loading state from send until response.

```javascript
// Source: decisions D-04/D-04b
const STAGES = [
  'กำลังวิเคราะห์ความต้องการ...',
  'กำลังออกแบบโซลูชัน...',
  'กำลังสร้าง BOM...',
  'กำลังเขียน proposal...'
];

function startLoadingBubble(threadEl) {
  const bubble = appendLoadingBubble(threadEl); // returns { el, stageLabelEl }
  let idx = 0;
  const timer = setInterval(() => {
    idx = (idx + 1) % STAGES.length;
    bubble.stageLabelEl.textContent = STAGES[idx];
  }, 8000);
  return { bubble, timer };
}

function stopLoadingBubble(bubble, timer) {
  clearInterval(timer);
  bubble.el.remove();
}
```

**Critical:** Always call `clearInterval(timer)` in BOTH the success and error paths. A dangling `setInterval` causes the stage label to keep updating after the response arrives.

### Pattern 5: Markdown Rendering with marked + DOMPurify

**What:** Render assistant `text` field (markdown) as sanitized HTML.

**When to use:** All assistant message bubbles.

```javascript
// Source: marked.js v17 API + DOMPurify docs
function renderMarkdown(text) {
  const raw = marked.parse(text);           // markdown → HTML string
  return DOMPurify.sanitize(raw);           // sanitize → safe HTML string
}

function appendAssistantBubble(threadEl, markdown) {
  const msgEl = document.createElement('div');
  msgEl.className = 'message';
  const bubbleEl = document.createElement('div');
  bubbleEl.className = 'bubble assistant';
  bubbleEl.innerHTML = renderMarkdown(markdown);
  msgEl.appendChild(bubbleEl);
  threadEl.appendChild(msgEl);
  return msgEl;
}
```

**marked.js v17 API change:** `marked.parse()` is synchronous by default in v17 (the async option was removed). `marked.marked()` is also valid. Do NOT use `marked()` as a function call directly — it was deprecated and removed in v5+. Use `marked.parse(str)`.

### Pattern 6: Solution Option Cards

**What:** Parse solution options from assistant markdown text (stage = awaiting_selection) and render as clickable cards.

**When to use:** When `stage === 'awaiting_selection'` in the API response.

```javascript
// Source: lib/chat.js formatSolutionOptions() — output is markdown with numbered list
// Detect by stage field, not by parsing markdown text
function appendSolutionCards(threadEl, markdownText, onSelect) {
  // Render full markdown first
  const wrapEl = appendAssistantBubble(threadEl, markdownText);

  // Append a card strip below the bubble
  const cardStrip = document.createElement('div');
  cardStrip.className = 'solution-cards';

  // Parse numbered options from text: lines matching /^\d+\.\s+\*\*(.+?)\*\*/
  const matches = [...markdownText.matchAll(/^(\d+)\.\s+\*\*(.+?)\*\*/gm)];
  matches.forEach(([, num, name]) => {
    const card = buildOptionCard(num, name, () => {
      // Disable all cards in this strip
      cardStrip.querySelectorAll('button').forEach(b => b.disabled = true);
      onSelect(num);
    });
    cardStrip.appendChild(card);
  });

  wrapEl.appendChild(cardStrip);
}
```

**Alternative (simpler):** If the response stage === 'awaiting_selection', render the markdown bubble normally AND append a separate row of buttons numbered 1 to N (count options by counting `^N.` lines). Avoids fragile regex.

### Pattern 7: apiFetch Wrapper (from admin.js)

**What:** Centralize `fetch` with `credentials: 'include'` and JSON defaults.

```javascript
// Source: admin/admin.js lines 109-121
async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',   // sends ai_presale_session cookie
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}
```

**Note:** Use `credentials: 'include'` not `'same-origin'` — admin.js uses `same-origin` which works for same-origin requests, but `include` is more explicit. Both work since the chat page is served from the same origin.

### Anti-Patterns to Avoid

- **Setting `innerHTML` without DOMPurify:** Marked output can contain `<script>` or `onerror` attributes from adversarial input. Always `DOMPurify.sanitize()` before innerHTML.
- **`overflow: auto` on `.main` instead of `.thread`:** Puts scrollbar on the whole right column, which means the input bar scrolls away. Only `.thread` should scroll.
- **Calling `scrollIntoView()` during streaming or animation:** Causes layout jank. Use `scrollTop = scrollHeight` on the container.
- **Not disabling input during loading:** Allows double-submit. Backend is synchronous (no idempotency protection). Disable `<textarea>` + `<button>` on send, re-enable on response.
- **Using `type="module"` for chat.js if CDN scripts are not module format:** `marked.umd.js` and `purify.min.js` expose globals (`window.marked`, `window.DOMPurify`). Load them with plain `<script>` tags before `chat.js`. Then load `chat.js` as plain `<script>` (not module) so it can access those globals. OR load chat.js as module and import via CDN ESM — but mixing CDN globals with module is cleaner to avoid.
- **Forgetting `escapeHtml()` on user text:** User bubbles are plain text (not markdown). Use `escapeHtml()` from admin.js before setting `textContent` or use `.textContent = value` directly (which auto-escapes).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Markdown → HTML | Custom regex parser | marked.js | Tables, nested lists, code blocks have many edge cases |
| XSS sanitization | Allowlist attribute filter | DOMPurify | Data URIs, SVG onload, mXSS attacks defeat naive filters |
| BOM table rendering | Custom table builder | Markdown table syntax → marked.js | Backend already returns markdown tables; parse, don't rebuild |
| Session cookie handling | Custom cookie parser | Existing user-auth.js + `credentials: 'include'` | Session layer is already implemented |

**Key insight:** The backend already returns markdown-formatted text. The frontend job is parse → sanitize → inject. Custom table builders would diverge from the backend output format.

---

## Common Pitfalls

### Pitfall 1: Full-Height Layout Breaks Without `overflow: hidden` on Parent

**What goes wrong:** The `.main` column grows past viewport height. The input bar scrolls off-screen.

**Why it happens:** `flex: 1` on `.thread` expands the flex child, but does not constrain it unless the parent has a fixed height AND `overflow: hidden`. Without it, content causes the parent to grow.

**How to avoid:** Set `height: 100vh; overflow: hidden` on `body` and `.main`. Only `.thread` and `.sidebar` get `overflow-y: auto`.

**Warning signs:** Sending a long message causes the page to scroll instead of the thread scrolling.

### Pitfall 2: `setInterval` Leak on Loading Bubble

**What goes wrong:** Stage label keeps rotating after the response arrives. Console shows label text updating after conversation is complete.

**Why it happens:** `clearInterval(timer)` called only in the success path, not the error/catch path.

**How to avoid:** Store the timer ID in a variable scoped to the send function. Call `stopLoadingBubble(bubble, timer)` in both `.then()` and `.catch()`.

### Pitfall 3: Scroll-to-Bottom Fires Before DOM Paint

**What goes wrong:** `threadEl.scrollTop = threadEl.scrollHeight` fires synchronously after `appendChild()`. The new element's height is not yet calculated. Scroll stops 1 bubble short.

**Why it happens:** Browser layout happens asynchronously after JS execution.

**How to avoid:** Wrap in `requestAnimationFrame(() => { thread.scrollTop = thread.scrollHeight; })`.

### Pitfall 4: marked.js API Change Between v4/v5 and v17

**What goes wrong:** Code uses `marked(text)` or `marked.marked(text)` expecting the old API. In v17, `marked.marked` is still valid but the top-level function call `marked(text)` was removed.

**Why it happens:** Training data / examples reference marked v4 which had `const { marked } = require('marked')` and called it as a function.

**How to avoid:** Use `marked.parse(text)` exclusively. The UMD build exposes `window.marked` as an object; `window.marked.parse(str)` is the correct call.

**Verification:** `typeof window.marked` is `'object'`, not `'function'`, in v17.

### Pitfall 5: Cookie Not Sent to API Calls

**What goes wrong:** `fetch('/api/chat', ...)` returns 401 even when the session exists.

**Why it happens:** `credentials` defaults to `'same-origin'` in modern browsers. The session cookie (`ai_presale_session`) is HttpOnly and SameSite=Lax. This works for same-origin — but omitting `credentials` entirely causes some older browser versions to not send cookies.

**How to avoid:** Always pass `credentials: 'include'` (or `'same-origin'`) in the `apiFetch` wrapper. Matches existing admin.js pattern.

### Pitfall 6: Conversation ID Not Persisted Across Messages

**What goes wrong:** Each message creates a new project instead of continuing the conversation.

**Why it happens:** `conversation_id` returned in the first POST /api/chat response is not stored and re-sent in subsequent requests.

**How to avoid:** Store `activeConversationId` in module-level variable. On first response, set it. On each subsequent send, include `conversation_id: activeConversationId` in the request body. Reset to `null` on "New Chat".

### Pitfall 7: Solution Cards Rendered for Non-Selection Stages

**What goes wrong:** "เลือกตัวเลือกนี้" buttons appear on BOM/complete messages too (both contain numbered lists).

**Why it happens:** Using regex to detect solution options from message text instead of using the `stage` field.

**How to avoid:** Use `stage === 'awaiting_selection'` from the API response — not content inspection — to decide when to render option cards.

---

## Code Examples

### Loading Bubble HTML Structure

```html
<!-- Append this programmatically -->
<div class="message" id="loading-bubble">
  <div class="message-label">AI Presale Assistant</div>
  <div class="bubble assistant">
    <div class="typing">
      <div class="typing-dots">
        <span></span><span></span><span></span>
      </div>
      <span id="stage-label">กำลังวิเคราะห์ความต้องการ...</span>
    </div>
  </div>
</div>
```

The `.typing-dots` animation CSS already exists in `intake/index.html` — copy verbatim to `chat/chat.html`.

### Server Static Routes to Add (server.js)

```javascript
// Pattern: follows existing /admin/admin.js pattern at lines 150-156
if (request.method === 'GET' && url.pathname === '/chat') {
  return serveFile(response, path.join(__dirname, 'chat', 'chat.html'), 'text/html; charset=utf-8');
}
if (request.method === 'GET' && url.pathname === '/login') {
  return serveFile(response, path.join(__dirname, 'login', 'login.html'), 'text/html; charset=utf-8');
}
if (request.method === 'GET' && url.pathname === '/chat/chat.js') {
  return serveFile(response, path.join(__dirname, 'chat', 'chat.js'), 'application/javascript; charset=utf-8');
}
if (request.method === 'GET' && url.pathname === '/login/login.js') {
  return serveFile(response, path.join(__dirname, 'login', 'login.js'), 'application/javascript; charset=utf-8');
}
```

### Proposal Download Endpoint

```javascript
// Add before final 404 handler
if (request.method === 'GET' && url.pathname.match(/^\/api\/proposals\/[^/]+\/download$/)) {
  if (!requireUserAuth(request, response)) return;
  const projectId = url.pathname.split('/')[3];
  try {
    const project = await getProjectById(projectId);
    if (!project || !project.proposal_path) {
      return json(response, 404, { ok: false, error: 'Proposal not found' });
    }
    const file = await readFile(project.proposal_path);
    const filename = path.basename(project.proposal_path);
    response.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`
    });
    response.end(file);
  } catch (error) {
    return json(response, 500, { ok: false, error: error.message });
  }
}
```

### Login Redirect Pattern (login.js)

```javascript
// Source: mirrors admin/admin.js syncSession() but redirects instead of toggling visibility
async function checkSession() {
  const { response, payload } = await apiFetch('/api/auth/session', { method: 'GET' });
  if (response.ok && payload.authenticated) {
    window.location.replace('/chat');
  }
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(loginForm));
  const { response, payload } = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: data.username, password: data.password })
  });
  if (!response.ok) {
    showError(payload.error || 'Login failed');
    return;
  }
  window.location.replace('/chat');
});
```

### GET /api/projects Response Shape

From `server.js` line 432-437:
```json
{ "ok": true, "projects": [ { "id": "...", "customer_name": "...", "created_at": "..." } ] }
```

Sidebar renders `customer_name` + formatted `created_at` per project item.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `marked(text)` direct call | `marked.parse(text)` | marked v5 (2023) | Must use `.parse()` method |
| `marked.setOptions({...})` | `marked.use({ ... })` or options in `marked.parse(text, opts)` | marked v5 | Options API changed |
| DOMPurify as CommonJS require | `DOMPurify` global from UMD CDN | Ongoing | Use `window.DOMPurify.sanitize()` |

**Deprecated:**
- `marked.Renderer`: Still available but configure via `marked.use({ renderer })` in v5+
- Top-level `marked()` function call: Removed in v5

---

## Open Questions

1. **Conversation history loading — which endpoint?**
   - What we know: GET /api/projects returns project list. Phase 3 CONTEXT mentions `conversations` and `messages` tables exist.
   - What's unclear: There is no GET /api/conversations/:id/messages endpoint in current server.js. This endpoint will need to be added or the sidebar "click to load conversation" feature must be descoped/deferred.
   - Recommendation: Add `GET /api/conversations/:conversationId/messages` endpoint returning `{ messages: [{role, content, created_at}] }` as a server.js task in the plan. If out of scope, sidebar items are display-only (no reload into thread).

2. **proposal_url vs proposal_path in projects table**
   - What we know: `lib/chat.js` line 48 checks `project.proposal_url`. `server.js` download endpoint needs `project.proposal_path`.
   - What's unclear: Does `proposal_path` store an absolute file system path or a relative path? Need to verify schema.
   - Recommendation: Read `lib/projects.js` in plan wave to confirm field name and path format before implementing the download endpoint.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Static file serving, server.js routes | Yes | v24.14.0 | — |
| marked.js CDN | Markdown rendering | CDN (no install) | 17.0.5 | — |
| DOMPurify CDN | XSS sanitization | CDN (no install) | 3.3.3 | — |
| Browser (Chrome/Edge) | Chat UI | Yes (internal office use) | Modern | — |

No missing dependencies with no fallback.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | node:test (built-in, Node 24.14.0) |
| Config file | none — `node --test` scans test/*.test.js |
| Quick run command | `node --test --test-isolation=none test/chat.test.js` |
| Full suite command | `node --test --test-isolation=none` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| M2 | POST /api/chat returns text + stage + conversation_id | unit (API) | `node --test --test-isolation=none test/chat.test.js` | Yes |
| M3 | GET /api/auth/session returns authenticated after login | unit (API) | `node --test --test-isolation=none test/auth.test.js` | Yes |
| M3 | POST /api/auth/login sets cookie | unit (API) | `node --test --test-isolation=none test/auth.test.js` | Yes |
| M4 | GET /api/projects returns user's project list | unit (API) | `node --test --test-isolation=none test/chat.test.js` | Yes |
| D-05 | GET /api/proposals/:id/download returns file with Content-Disposition | unit (API) | `node --test --test-isolation=none test/chat.test.js` | No — Wave 0 gap |
| D-01c | GET /chat served correctly | smoke | `node scripts/smoke.js` | Partial |

**Frontend behavior (HTML/CSS/JS rendering):** No automated test infrastructure exists for DOM behavior. These are manual verification items per the team testing acceptance criteria (M5).

### Sampling Rate

- **Per task commit:** `node --test --test-isolation=none test/chat.test.js`
- **Per wave merge:** `node --test --test-isolation=none`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `test/chat.test.js` — add test for `GET /api/proposals/:projectId/download` (new endpoint from D-05)
- [ ] `test/chat.test.js` — add test for `GET /chat` static route (returns 200 + text/html)
- [ ] `test/chat.test.js` — add test for `GET /login` static route (returns 200 + text/html)
- [ ] `test/chat.test.js` — add test for `GET /api/conversations/:id/messages` if endpoint is added

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 04 |
|-----------|-------------------|
| Never send proposal without `human_approved = true` | Not relevant: human_approved gate is disabled (team self-review). Download endpoint just reads `proposal_path`. |
| Log every LLM call to `agent_logs` | Not relevant for frontend; backend already handles this. |
| Validate JSON output before writing to Supabase | Not relevant for frontend JS. |
| Keep prompts in `agents/_prompts/*.md` | Not relevant. |
| Use top-5 knowledge chunks | Not relevant for frontend. |
| Use deterministic settings for BOM/proposal | Not relevant for frontend. |
| Run each agent against `test/fixtures/*.json` before pipeline testing | Not relevant (no new agents in this phase). |
| Vanilla HTML/CSS/JS, no build step | Core constraint — no framework, no bundler, no TypeScript. |
| ESM not used in frontend | Load CDN scripts as plain `<script>`, not `<script type="module">`. Load chat.js as plain `<script>`. |

---

## Sources

### Primary (HIGH confidence)

- `intake/index.html` — CSS variables, bubble/thread/typing animation patterns (read directly)
- `admin/admin.js` — apiFetch wrapper, setPortalVisibility, escapeHtml, session check pattern (read directly)
- `lib/chat.js` — API response shape, stage values, markdown format of responses (read directly)
- `server.js` — serveFile pattern, requireUserAuth, existing routes (read directly)
- npm registry `npm view marked version` → 17.0.5 confirmed
- npm registry `npm view dompurify version` → 3.3.3 confirmed
- jsDelivr `https://cdn.jsdelivr.net/npm/marked@17.0.5/lib/` — file listing confirming `marked.umd.js` is the browser build
- jsDelivr `https://cdn.jsdelivr.net/npm/dompurify@3.3.3/dist/` — file listing confirming `purify.min.js` is the minified browser build
- `https://cdn.jsdelivr.net/npm/marked@17.0.5/package.json` — confirmed `browser` field points to `./lib/marked.umd.js`

### Secondary (MEDIUM confidence)

- MDN/browser standard: `requestAnimationFrame` for post-layout scroll — standard browser API, well-documented
- marked.js v5 changelog: `marked.parse()` as the correct API replacing direct function call — cross-verified with npm package.json exports field

### Tertiary (LOW confidence)

- SRI hash values for CDN scripts: Not retrieved (jsDelivr UI required). Flag: obtain SRI hashes manually before committing chat.html.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified against npm registry
- Architecture: HIGH — patterns derived directly from existing codebase files
- Pitfalls: HIGH — derived from actual code inspection + known API changes in marked v5→v17
- CDN SRI hashes: LOW — jsDelivr UI required; use `https://www.jsdelivr.com/package/npm/marked?version=17.0.5` to copy

**Research date:** 2026-03-31
**Valid until:** 2026-04-30 (CDN versions may update; re-verify before publishing)
