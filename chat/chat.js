const thread = document.querySelector("#thread");
const promptBox = document.querySelector("#prompt-box");
const sendBtn = document.querySelector("#send-btn");
const newChatBtn = document.querySelector("#new-chat-btn");
const projectList = document.querySelector("#project-list");
const errorBanner = document.querySelector("#error-banner");
const stageBadge = document.querySelector("#stage-badge");
const stageText = document.querySelector("#stage-text");

let activeConversationId = null;
let activeProjectId = null;
let currentUser = null;
let loadingTimer = null;
let loadingBubble = null;
let lastUserMessage = null;

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  if (response.status === 401) { window.location.replace("/login"); return { response, payload: {} }; }
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderMarkdown(text) {
  return DOMPurify.sanitize(marked.parse(text));
}

function scrollToBottom() {
  requestAnimationFrame(() => { thread.scrollTop = thread.scrollHeight; });
}

function setStage(stage) {
  const map = {
    ready: { label: "Ready", active: false, done: false },
    processing: { label: "Processing", active: true, done: false },
    discovery_questions: { label: "Discovery", active: false, done: false },
    awaiting_selection: { label: "Awaiting Selection", active: false, done: false },
    complete: { label: "Complete", active: false, done: true }
  };
  const s = map[stage] || map.ready;
  stageText.textContent = s.label;
  stageBadge.className = "stage-badge" + (s.active ? " active" : "") + (s.done ? " done" : "");
}

function showError(msg) { errorBanner.textContent = msg; errorBanner.classList.add("visible"); }
function hideError() { errorBanner.classList.remove("visible"); }
function formatDate(iso) { return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" }); }

function appendUserBubble(text) {
  const msg = document.createElement("div");
  msg.className = "message user";
  msg.innerHTML = `<div class="message-label">คุณ</div><div class="bubble user">${escapeHtml(text)}</div>`;
  thread.appendChild(msg);
  scrollToBottom();
}

function appendAssistantBubble(markdown, stage) {
  const msg = document.createElement("div");
  msg.className = "message";
  msg.innerHTML = `
    <div class="message-label">AI Presale Assistant</div>
    <div class="bubble assistant">${renderMarkdown(markdown)}</div>
  `;
  thread.appendChild(msg);
  if (stage === "awaiting_selection") appendSolutionCards(msg, markdown);
  scrollToBottom();
  return msg;
}

function appendErrorBubble(errorText) {
  const msg = document.createElement("div");
  msg.className = "message";
  msg.innerHTML = `
    <div class="message-label">AI Presale Assistant</div>
    <div class="bubble assistant error-bubble">
      <div style="margin-bottom:6px">${escapeHtml(errorText)}</div>
      <button class="retry-btn">↺ ลองอีกครั้ง</button>
    </div>
  `;
  msg.querySelector(".retry-btn").addEventListener("click", () => {
    msg.remove();
    if (lastUserMessage) sendMessage(lastUserMessage);
  });
  thread.appendChild(msg);
  scrollToBottom();
}

const STAGES = [
  "กำลังวิเคราะห์ความต้องการ...",
  "กำลังออกแบบ solution...",
  "ผู้เชี่ยวชาญกำลัง review...",
  "กำลังสร้าง BOM...",
  "กำลังเขียน proposal..."
];

function startLoadingBubble() {
  const msg = document.createElement("div");
  msg.className = "message";
  msg.id = "loading-bubble";
  msg.innerHTML = `
    <div class="message-label">AI Presale Assistant</div>
    <div class="bubble assistant">
      <div class="typing-indicator">
        <div class="typing-dots"><span></span><span></span><span></span></div>
        <span class="stage-label">${STAGES[0]}</span>
      </div>
    </div>
  `;
  thread.appendChild(msg);
  scrollToBottom();
  let idx = 0;
  loadingBubble = msg;
  setStage("processing");
  loadingTimer = setInterval(() => {
    idx = (idx + 1) % STAGES.length;
    const label = msg.querySelector(".stage-label");
    if (label) label.textContent = STAGES[idx];
  }, 7000);
}

function stopLoadingBubble() {
  if (loadingTimer) { clearInterval(loadingTimer); loadingTimer = null; }
  if (loadingBubble) { loadingBubble.remove(); loadingBubble = null; }
}

async function sendMessage(text) {
  if (!text || !text.trim()) return;
  hideError();
  lastUserMessage = text.trim();
  const es = document.querySelector("#empty-state");
  if (es) es.remove();
  appendUserBubble(text.trim());
  promptBox.disabled = true;
  sendBtn.disabled = true;
  startLoadingBubble();
  try {
    const { response, payload } = await apiFetch("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message: text.trim(), conversation_id: activeConversationId })
    });
    stopLoadingBubble();
    if (payload.ok === false || payload.stage === "error") {
      appendErrorBubble(payload.error || payload.text || "เกิดข้อผิดพลาด กรุณาลองใหม่");
      setStage("ready");
      return;
    }
    if (!response.ok) { showError(payload.error || "ไม่สามารถส่งข้อความได้"); setStage("ready"); return; }
    activeConversationId = payload.conversation_id;
    activeProjectId = payload.project_id;
    appendAssistantBubble(payload.text, payload.stage);
    setStage(payload.stage || "ready");
    if (payload.stage === "complete" && payload.project_id) {
      appendDownloadButton(payload.project_id);
    }
    if (payload.conversation_id) {
      await loadProjects();
      document.querySelectorAll(".project-item").forEach(el => el.classList.remove("active"));
      const activeItem = document.querySelector(`[data-project-id="${activeProjectId}"]`);
      if (activeItem) activeItem.classList.add("active");
    }
  } catch {
    stopLoadingBubble();
    showError("ไม่สามารถส่งข้อความได้ กรุณาลองใหม่");
    setStage("ready");
  } finally {
    promptBox.disabled = false;
    sendBtn.disabled = false;
    promptBox.focus();
  }
}

sendBtn.addEventListener("click", () => { sendMessage(promptBox.value); promptBox.value = ""; });
promptBox.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); sendMessage(promptBox.value); promptBox.value = ""; }
});

// Example chips
document.querySelectorAll(".example-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    promptBox.value = chip.dataset.text;
    promptBox.focus();
  });
});

function appendSolutionCards(msgEl, markdownText) {
  const strip = document.createElement("div");
  strip.className = "solution-cards";
  const matches = [...markdownText.matchAll(/^(\d+)\.\s+\*\*(.+?)\*\*/gm)];
  if (matches.length === 0) return;
  matches.forEach(([, num, name]) => {
    const card = document.createElement("div");
    card.className = "solution-card";
    card.innerHTML = `
      <div class="solution-card-name">${escapeHtml(name)}</div>
      <button>เลือกตัวเลือกนี้</button>
    `;
    card.querySelector("button").addEventListener("click", () => {
      strip.querySelectorAll("button").forEach(b => { b.disabled = true; });
      sendMessage(`เลือกตัวเลือกที่ ${num}`);
    });
    strip.appendChild(card);
  });
  msgEl.appendChild(strip);
}

function appendDownloadButton(projectId) {
  const msg = document.createElement("div");
  msg.className = "message";
  const revisionStrip = `
    <div class="revision-strip">
      <div class="revision-label">ต้องการแก้ไข?</div>
      <button class="revision-chip" data-action="เปลี่ยน vendor">🔄 เปลี่ยน vendor</button>
      <button class="revision-chip" data-action="เปลี่ยน solution option">↔️ เปลี่ยน solution</button>
      <button class="revision-chip" data-action="ปรับ requirements ใหม่">✏️ ปรับ requirements</button>
    </div>
  `;
  msg.innerHTML = `
    <div class="message-label">AI Presale Assistant</div>
    <div class="bubble assistant">
      <a href="/api/proposals/${encodeURIComponent(projectId)}/download" download class="download-btn">
        <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
        ดาวน์โหลด Proposal (.docx)
      </a>
      ${revisionStrip}
    </div>
  `;
  msg.querySelectorAll(".revision-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const action = chip.dataset.action;
      promptBox.value = action;
      promptBox.focus();
    });
  });
  thread.appendChild(msg);
  scrollToBottom();
}

async function loadProjects() {
  const { response, payload } = await apiFetch("/api/projects", { method: "GET" });
  if (!response.ok) return;
  projectList.innerHTML = "";
  if (!payload.projects?.length) {
    projectList.innerHTML = `<div style="padding:12px 16px;font-size:12px;color:var(--ink-faint)">ยังไม่มี project</div>`;
    return;
  }
  payload.projects.forEach(project => {
    const item = document.createElement("div");
    item.className = "project-item";
    item.dataset.projectId = project.id;
    item.innerHTML = `
      <div class="project-item-name">${escapeHtml(project.customer_name || "Untitled")}</div>
      <div class="project-item-date">${formatDate(project.created_at)}</div>
    `;
    item.addEventListener("click", () => loadConversation(project.id));
    projectList.appendChild(item);
  });
}

async function loadConversation(projectId) {
  const { payload: convPayload } = await apiFetch(`/api/projects/${projectId}/conversations`, { method: "GET" });
  if (!convPayload.ok || !convPayload.conversations?.length) return;
  const conv = convPayload.conversations[0];
  activeConversationId = conv.id;
  activeProjectId = projectId;
  document.querySelectorAll(".project-item").forEach(el => el.classList.remove("active"));
  document.querySelector(`[data-project-id="${projectId}"]`)?.classList.add("active");
  const { payload: msgPayload } = await apiFetch(`/api/conversations/${conv.id}/messages`, { method: "GET" });
  if (!msgPayload.ok) return;
  clearThread();
  msgPayload.messages.forEach(msg => {
    if (msg.role === "user") appendUserBubble(msg.content);
    else appendAssistantBubble(msg.content, conv.stage);
  });
  if (conv.stage === "complete") { appendDownloadButton(projectId); setStage("complete"); }
  else setStage(conv.stage || "ready");
}

function clearThread() { thread.innerHTML = ""; }
function showEmptyState() {
  thread.innerHTML = `
    <div class="empty-state" id="empty-state">
      <div class="empty-icon"><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg></div>
      <h2>เริ่ม presale ใหม่</h2>
      <p>เล่าความต้องการลูกค้า ระบบจะออกแบบ solution และสร้าง BOM + proposal</p>
      <div class="empty-examples">
        <div class="example-chip" data-text="ลูกค้าต้องการ tech refresh HCI ไม่เอา VMware 80 VMs 50TB งบ 8M THB">💡 HCI tech refresh — 80 VMs, 50TB, งบ 8M</div>
        <div class="example-chip" data-text="ต้องการ DR site สำหรับธนาคาร RTO 4 ชม. RPO 1 ชม. Production site เป็น Nutanix">🔁 DR site — RTO 4hr, RPO 1hr, Nutanix primary</div>
        <div class="example-chip" data-text="ลูกค้าต้องการ Backup & Recovery รองรับ 200 VMs ป้องกัน ransomware ใช้ Veeam">🛡️ Backup & Recovery — 200 VMs, anti-ransomware</div>
      </div>
    </div>
  `;
  document.querySelectorAll(".example-chip").forEach(chip => {
    chip.addEventListener("click", () => { promptBox.value = chip.dataset.text; promptBox.focus(); });
  });
  setStage("ready");
}

newChatBtn.addEventListener("click", () => {
  activeConversationId = null;
  activeProjectId = null;
  showEmptyState();
  document.querySelectorAll(".project-item").forEach(el => el.classList.remove("active"));
  promptBox.focus();
});

async function syncSession() {
  const { response, payload } = await apiFetch("/api/auth/session", { method: "GET" });
  if (!response.ok || !payload.authenticated) { window.location.replace("/login"); return; }
  currentUser = payload.user;
  await loadProjects();
}

syncSession();
