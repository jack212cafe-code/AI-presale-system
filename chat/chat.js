const thread = document.querySelector("#thread");
const emptyState = document.querySelector("#empty-state");
const promptBox = document.querySelector("#prompt-box");
const sendBtn = document.querySelector("#send-btn");
const newChatBtn = document.querySelector("#new-chat-btn");
const projectList = document.querySelector("#project-list");
const errorBanner = document.querySelector("#error-banner");

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
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (response.status === 401) {
    window.location.replace("/login");
    return { response, payload: {} };
  }
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

function showError(msg) {
  errorBanner.textContent = msg;
  errorBanner.classList.add("visible");
}

function hideError() {
  errorBanner.classList.remove("visible");
}

function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

function appendUserBubble(text) {
  const msg = document.createElement("div");
  msg.className = "message";
  msg.innerHTML = `
    <div class="message-label">คุณ</div>
    <div class="bubble user">${escapeHtml(text)}</div>
  `;
  thread.appendChild(msg);
  scrollToBottom();
}

function appendAssistantBubble(markdown, stage) {
  const msg = document.createElement("div");
  msg.className = "message";
  const bubbleHtml = renderMarkdown(markdown);
  msg.innerHTML = `
    <div class="message-label">AI Presale Assistant</div>
    <div class="bubble assistant">${bubbleHtml}</div>
  `;
  thread.appendChild(msg);
  if (stage === "awaiting_selection") {
    appendSolutionCards(msg, markdown);
  }
  scrollToBottom();
  return msg;
}

function appendErrorBubble(errorText) {
  const msg = document.createElement("div");
  msg.className = "message";
  msg.innerHTML = `
    <div class="message-label">AI Presale Assistant</div>
    <div class="bubble assistant error-bubble">
      <span class="error-text">${escapeHtml(errorText)}</span>
      <button class="retry-btn" type="button">ลองอีกครั้ง</button>
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
  "กำลังออกแบบโซลูชัน...",
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
      <div class="typing">
        <div class="typing-dots"><span></span><span></span><span></span></div>
        <span class="stage-label">${STAGES[0]}</span>
      </div>
    </div>
  `;
  thread.appendChild(msg);
  scrollToBottom();
  let idx = 0;
  loadingBubble = msg;
  loadingTimer = setInterval(() => {
    idx = (idx + 1) % STAGES.length;
    const label = msg.querySelector(".stage-label");
    if (label) label.textContent = STAGES[idx];
  }, 8000);
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
      return;
    }
    if (!response.ok) {
      showError(payload.error || "ไม่สามารถส่งข้อความได้ กรุณาลองใหม่อีกครั้ง");
      return;
    }
    activeConversationId = payload.conversation_id;
    activeProjectId = payload.project_id;
    appendAssistantBubble(payload.text, payload.stage);
    if (payload.stage === "complete" && payload.project_id) {
      appendDownloadButton(payload.project_id);
    }
    if (payload.conversation_id) {
      await loadProjects();
      const activeItem = document.querySelector(`[data-project-id="${activeProjectId}"]`);
      if (activeItem) activeItem.classList.add("active");
    }
  } catch (error) {
    stopLoadingBubble();
    showError("ไม่สามารถส่งข้อความได้ กรุณาลองใหม่อีกครั้ง");
  } finally {
    promptBox.disabled = false;
    sendBtn.disabled = false;
    promptBox.focus();
  }
}

sendBtn.addEventListener("click", () => {
  sendMessage(promptBox.value);
  promptBox.value = "";
});

promptBox.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    sendMessage(promptBox.value);
    promptBox.value = "";
  }
});

async function syncSession() {
  const { response, payload } = await apiFetch("/api/auth/session", { method: "GET" });
  if (!response.ok || !payload.authenticated) {
    window.location.replace("/login");
    return;
  }
  currentUser = payload.user;
  await loadProjects();
}

function appendSolutionCards(msgEl, markdownText) {
  const cardStrip = document.createElement("div");
  cardStrip.className = "solution-cards";
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
      cardStrip.querySelectorAll("button").forEach(b => { b.disabled = true; });
      sendMessage(`เลือกตัวเลือกที่ ${num}`);
    });
    cardStrip.appendChild(card);
  });
  msgEl.appendChild(cardStrip);
}

function appendDownloadButton(projectId) {
  const msg = document.createElement("div");
  msg.className = "message";
  msg.innerHTML = `
    <div class="message-label">AI Presale Assistant</div>
    <a href="/api/proposals/${encodeURIComponent(projectId)}/download" download class="download-btn">ดาวน์โหลด Proposal</a>
  `;
  thread.appendChild(msg);
  scrollToBottom();
}

async function loadProjects() {
  const { response, payload } = await apiFetch("/api/projects", { method: "GET" });
  if (!response.ok) return;
  projectList.innerHTML = "";
  payload.projects.forEach(project => {
    const item = document.createElement("div");
    item.className = "project-item";
    item.dataset.projectId = project.id;
    item.innerHTML = `
      <div class="project-item-name">${escapeHtml(project.customer_name || "Untitled Project")}</div>
      <div class="project-item-date">${formatDate(project.created_at)}</div>
    `;
    item.addEventListener("click", () => loadConversation(project.id));
    projectList.appendChild(item);
  });
}

async function loadConversation(projectId) {
  const { payload: convPayload } = await apiFetch(`/api/projects/${projectId}/conversations`, { method: "GET" });
  if (!convPayload.ok || !convPayload.conversations.length) return;
  const conversation = convPayload.conversations[0];
  activeConversationId = conversation.id;
  activeProjectId = projectId;
  document.querySelectorAll(".project-item").forEach(el => el.classList.remove("active"));
  const activeItem = document.querySelector(`[data-project-id="${projectId}"]`);
  if (activeItem) activeItem.classList.add("active");
  const { payload: msgPayload } = await apiFetch(`/api/conversations/${conversation.id}/messages`, { method: "GET" });
  if (!msgPayload.ok) return;
  clearThread();
  msgPayload.messages.forEach(msg => {
    if (msg.role === "user") {
      appendUserBubble(msg.content);
    } else {
      appendAssistantBubble(msg.content, conversation.stage);
    }
  });
  if (conversation.stage === "complete") {
    appendDownloadButton(projectId);
  }
}
function clearThread() { thread.innerHTML = ""; }
function showEmptyState() {
  thread.innerHTML = `<div class="empty-state" id="empty-state"><h2>เริ่มต้นการสนทนา</h2><p>พิมพ์รายละเอียดโปรเจกต์ของคุณ เช่น ขนาดองค์กร ระบบที่ต้องการ หรือปัญหาที่พบ</p></div>`;
}

newChatBtn.addEventListener("click", () => {
  activeConversationId = null;
  activeProjectId = null;
  showEmptyState();
  document.querySelectorAll(".project-item").forEach(el => el.classList.remove("active"));
  promptBox.focus();
});

syncSession();
