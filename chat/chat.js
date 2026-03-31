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

function appendSolutionCards(msgEl, markdownText) { /* Task 2 */ }
function appendDownloadButton(projectId) { /* Task 2 */ }
async function loadProjects() { /* Task 2 */ }
async function loadConversation(projectId) { /* Task 2 */ }
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
