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
let bomTimerStart = null;
let bomTimerInterval = null;

function startBomTimer(stageLabelEl) {
  if (bomTimerInterval) return;
  bomTimerStart = Date.now();
  bomTimerInterval = setInterval(() => {
    const secs = Math.floor((Date.now() - bomTimerStart) / 1000);
    if (stageLabelEl) stageLabelEl.textContent = `กำลังสร้าง BOM... (${secs}s)`;
  }, 1000);
}

function stopBomTimer() {
  if (bomTimerInterval) { clearInterval(bomTimerInterval); bomTimerInterval = null; }
  bomTimerStart = null;
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  if (response.status === 401) {
    alert("Session หมดอายุแล้ว กำลังนำไปหน้า login...");
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

function setStage(stage) {
  const map = {
    ready: { label: "Ready", active: false, done: false },
    processing: { label: "Processing", active: true, done: false },
    discovery_questions: { label: "Discovery", active: false, done: false },
    awaiting_selection: { label: "Awaiting Selection", active: false, done: false },
    bom: { label: "BOM Ready", active: false, done: false },
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
  const bubble = document.createElement("div");
  bubble.className = "bubble assistant";
  bubble.innerHTML = `<button class="copy-btn">คัดลอก</button>${renderMarkdown(markdown)}`;
  const copyBtn = bubble.querySelector(".copy-btn");
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(markdown).catch(() => {});
    copyBtn.textContent = "✓ คัดลอกแล้ว";
    copyBtn.classList.add("copied");
    setTimeout(() => { copyBtn.textContent = "คัดลอก"; copyBtn.classList.remove("copied"); }, 2000);
  });
  const label = document.createElement("div");
  label.className = "message-label";
  label.textContent = "Franky-Presale";
  msg.appendChild(label);
  msg.appendChild(bubble);
  thread.appendChild(msg);
  if (stage === "awaiting_selection") appendSolutionCards(msg, markdown);
  scrollToBottom();
  return msg;
}

function appendHintsPanel(hints) {
  if (!hints || hints.length === 0) return;
  const details = document.createElement("details");
  details.className = "hints-panel";
  const summary = document.createElement("summary");
  summary.textContent = "คำแนะนำสำหรับการฟังคำตอบ";
  const ul = document.createElement("ul");
  ul.className = "hints-list";
  hints.forEach(h => {
    const li = document.createElement("li");
    li.textContent = h;
    ul.appendChild(li);
  });
  details.appendChild(summary);
  details.appendChild(ul);
  thread.appendChild(details);
  scrollToBottom();
}

function appendErrorBubble(errorText) {
  const msg = document.createElement("div");
  msg.className = "message";
  msg.innerHTML = `
    <div class="message-label">Franky-Presale</div>
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

function startLoadingBubble() {
  const msg = document.createElement("div");
  msg.className = "message";
  msg.id = "loading-bubble";
  msg.innerHTML = `
    <div class="message-label">Franky-Presale</div>
    <div class="bubble assistant">
      <div class="skeleton">
        <div class="skeleton-line"></div>
        <div class="skeleton-line medium"></div>
        <div class="skeleton-line short"></div>
      </div>
      <div class="pipeline-progress">
        <div class="pipeline-steps" id="pipeline-steps">
          <div class="pipeline-step active" id="step-0"><span class="step-dot"></span></div>
          <div class="pipeline-step" id="step-1"><span class="step-dot"></span></div>
          <div class="pipeline-step" id="step-2"><span class="step-dot"></span></div>
        </div>
        <div class="pipeline-bar-track"><div class="pipeline-bar-fill" id="pipeline-bar-fill"></div></div>
        <span class="stage-label" id="pipeline-stage-label">กำลังเริ่มต้น...</span>
      </div>
    </div>
  `;
  thread.appendChild(msg);
  scrollToBottom();
  loadingBubble = msg;
  setStage("processing");
}

function updateLoadingProgress(step, total, label) {
  if (!loadingBubble) return;
  const fill = loadingBubble.querySelector("#pipeline-bar-fill");
  const stageLabel = loadingBubble.querySelector("#pipeline-stage-label");
  const steps = loadingBubble.querySelectorAll(".pipeline-step");
  if (fill) fill.style.width = `${Math.round((step / total) * 100)}%`;
  if (label && label.includes("BOM") && label.includes("สร้าง")) {
    if (stageLabel) stageLabel.textContent = `${label} (0s)`;
    startBomTimer(stageLabel);
  } else {
    stopBomTimer();
    if (stageLabel) stageLabel.textContent = label;
  }
  steps.forEach((s, i) => {
    s.classList.remove("active", "done");
    if (i < step - 1) s.classList.add("done");
    else if (i === step - 1) s.classList.add("active");
  });
}

function stopLoadingBubble() {
  if (loadingTimer) { clearInterval(loadingTimer); loadingTimer = null; }
  if (loadingBubble) { loadingBubble.remove(); loadingBubble = null; }
  stopBomTimer();
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
  sendBtn.classList.add("loading");
  startLoadingBubble();
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text.trim(), conversation_id: activeConversationId })
    });
    if (response.status === 401) { window.location.replace("/login"); return; }
    if (response.status === 429) { stopLoadingBubble(); showError("ส่งข้อความถี่เกินไป — กรุณารอสักครู่แล้วลองใหม่"); setStage("ready"); return; }
    if (!response.ok) { stopLoadingBubble(); showError("ไม่สามารถส่งข้อความได้"); setStage("ready"); return; }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let payload = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === "progress") {
            updateLoadingProgress(event.step, event.total, event.label);
          } else if (event.type === "agent.thinking") {
            updateLoadingProgress(1, 3, "AI กำลังคิดและวิเคราะห์ข้อมูล...");
          } else if (event.type === "agent.custom_tool_use") {
            const toolName = event.tool_name || event.name || "Tool";
            updateLoadingProgress(2, 3, `กำลังใช้งาน ${toolName}...`);
          } else if (event.type === "done") {
            payload = event;
          }
        } catch (e) { console.warn("[SSE parse]", e); }
      }
    }

    if (buffer.trim()) {
      try {
        const event = JSON.parse(buffer.trim().slice(6));
        if (event.type === "done") payload = event;
      } catch (e) { console.warn("[SSE parse]", e); }
    }

    stopLoadingBubble();
    if (!payload) { showError("ไม่ได้รับข้อมูลจาก server"); setStage("ready"); return; }
    if (payload.ok === false || payload.stage === "error") {
      appendErrorBubble(payload.error || payload.text || "เกิดข้อผิดพลาด กรุณาลองใหม่");
      setStage("ready");
      return;
    }
    activeConversationId = payload.conversation_id;
    activeProjectId = payload.project_id;
    appendAssistantBubble(payload.text, payload.stage);
    if (payload.stage === "discovery_questions" && payload.hints?.length > 0) {
      appendHintsPanel(payload.hints);
    }
    setStage(payload.stage || "ready");
    if (payload.project_id) {
      appendActionButtons(payload.project_id, payload.stage);
      if (payload.stage === "complete" && payload.grounding_warnings > 0) appendGroundingBanner(payload.grounding_warnings);
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
    sendBtn.classList.remove("loading");
    promptBox.focus();
  }
}

const hamburgerBtn = document.querySelector("#hamburger-btn");
const sidebar = document.querySelector(".sidebar");
const sidebarBackdrop = document.querySelector("#sidebar-backdrop");
const logoutBtn = document.querySelector("#logout-btn");

hamburgerBtn.addEventListener("click", () => {
  sidebar.classList.toggle("open");
  sidebarBackdrop.classList.toggle("visible");
});
sidebarBackdrop.addEventListener("click", () => {
  sidebar.classList.remove("open");
  sidebarBackdrop.classList.remove("visible");
});

logoutBtn.addEventListener("click", async () => {
  if (confirm("ต้องการออกจากระบบหรือไม่?")) {
    try { await apiFetch("/api/auth/logout", { method: "POST" }); } catch {}
    window.location.replace("/login");
  }
});

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

function appendGroundingBanner(count) {
  const msg = document.createElement("div");
  msg.className = "message";
  msg.innerHTML = `
    <div class="message-label">Franky-Presale</div>
    <div class="grounding-banner">
      <span>⚠️ พบ ${count} รายการที่ไม่มีใน KB — กรุณายืนยัน model number ก่อน quote</span>
      <a href="/admin" target="_blank">+ Add to KB</a>
    </div>
  `;
  thread.appendChild(msg);
  scrollToBottom();
}

async function submitFeedback(projectId, rating, btn) {
  try {
    const { response, payload } = await apiFetch(`/api/projects/${projectId}/feedback`, {
      method: "POST",
      body: JSON.stringify({ rating })
    });
    if (response.ok) {
      // Style buttons based on rating
      const wrap = btn.closest(".rating-wrap");
      const buttons = wrap.querySelectorAll(".rating-btn");
      buttons.forEach(b => {
        b.disabled = true;
        if (b.dataset.rating === "1" && rating === 1) b.classList.add("active-up");
        if (b.dataset.rating === "-1" && rating === -1) b.classList.add("active-down");
      });
    } else {
      alert("ไม่สามารถบันทึก Rating ได้");
    }
  } catch (e) {
    console.error("[feedback]", e);
  }
}

function exportButton(label, action, projectId) {
  return `
    <button class="download-btn" data-export-action="${action}" data-project-id="${encodeURIComponent(projectId)}">
      <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
      ${label}
    </button>
  `;
}

function appendActionButtons(projectId, stage) {
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

  const exportActions = [];
  if (stage === "bom") {
    exportActions.push(exportButton("Export BOM (.xlsx)", "bom", projectId));
    exportActions.push(exportButton("Export Solution (.docx)", "solution", projectId));
    exportActions.push(exportButton("Export Spec Sheet for Distributor (.docx)", "spec", projectId));
  } else if (stage === "complete") {
    exportActions.push(exportButton("Export BOM (.xlsx)", "bom", projectId));
    exportActions.push(exportButton("Export Solution (.docx)", "solution", projectId));
    exportActions.push(exportButton("Export Spec Sheet for Distributor (.docx)", "spec", projectId));
    exportActions.push(exportButton("Download Proposal (.docx)", "proposal", projectId));
  }

  if (exportActions.length === 0) return;

  msg.innerHTML = `
    <div class="message-label">Franky-Presale</div>
    <div class="bubble assistant">
      <div class="export-actions">${exportActions.join("")}</div>
      <div class="rating-wrap">
        <span class="rating-label">ประเมินคุณภาพ:</span>
        <button class="rating-btn" data-rating="1" title="ดีมาก">👍</button>
        <button class="rating-btn" data-rating="-1" title="ต้องปรับปรุง">👎</button>
      </div>
      ${revisionStrip}
    </div>
  `;

  msg.querySelectorAll(".revision-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      sendMessage(chip.dataset.action);
    });
  });

  msg.querySelectorAll("[data-export-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const projectIdDecoded = decodeURIComponent(btn.dataset.projectId || "");
      const action = btn.dataset.exportAction;
      if (action === "bom") downloadBOM(projectIdDecoded, btn);
      else if (action === "solution") downloadSolution(projectIdDecoded, btn);
      else if (action === "spec") downloadBinary(`/api/projects/${projectIdDecoded}/export/spec`, btn, `spec_${projectIdDecoded}.docx`, "กำลังโหลด Spec Sheet...");
      else downloadProposal(projectIdDecoded, btn);
    });
  });

  msg.querySelectorAll(".rating-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      submitFeedback(projectId, parseInt(btn.dataset.rating), btn);
    });
  });

  thread.appendChild(msg);
  scrollToBottom();
}

async function downloadBinary(url, btn, filename, loadingText) {
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = loadingText;
  try {
    const response = await fetch(url, { credentials: "include" });
    if (response.status === 404) {
      alert("ไม่พบไฟล์ export");
      return;
    }
    if (!response.ok) {
      alert("เกิดข้อผิดพลาดในการดาวน์โหลด");
      return;
    }
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(blobUrl);
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

async function downloadBOM(projectId, btn) {
  await downloadBinary(`/api/projects/${projectId}/export/bom`, btn, `bom_${projectId}.xlsx`, "กำลังโหลด BOM...");
}

async function downloadSolution(projectId, btn) {
  await downloadBinary(`/api/projects/${projectId}/export/solution`, btn, `solution_${projectId}.docx`, "กำลังโหลด Solution...");
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
    <div class="message-label">Franky-Presale</div>
    <div class="bubble assistant">
      <button class="download-btn" onclick="downloadProposal('${encodeURIComponent(projectId)}', this)">
        <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
        ดาวน์โหลด Proposal (.docx) — พร้อมส่งลูกค้า
      </button>
      <div class="rating-wrap">
        <span class="rating-label">ประเมินคุณภาพ:</span>
        <button class="rating-btn" data-rating="1" title="ดีมาก">👍</button>
        <button class="rating-btn" data-rating="-1" title="ต้องปรับปรุง">👎</button>
      </div>
      ${revisionStrip}
    </div>
  `;
  msg.querySelectorAll(".revision-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      sendMessage(chip.dataset.action);
    });
  });

  // Feedback buttons logic
  msg.querySelectorAll(".rating-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      submitFeedback(projectId, parseInt(btn.dataset.rating), btn);
    });
  });

  thread.appendChild(msg);
  scrollToBottom();
}

async function downloadProposal(projectId, btn) {
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = "กำลังโหลด...";
  try {
    const response = await fetch(`/api/proposals/${projectId}/download`, { credentials: "include" });
    if (response.status === 404) { alert("ไม่พบไฟล์ proposal — กรุณา generate ใหม่อีกครั้ง"); return; }
    if (!response.ok) { alert("เกิดข้อผิดพลาดในการดาวน์โหลด"); return; }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `proposal_${projectId}.docx`; a.click();
    URL.revokeObjectURL(url);
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
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
  appendActionButtons(projectId, conv.stage);
  setStage(conv.stage || "ready");
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

// ── TOR Mode ────────────────────────────────────────────────────────────────
const torToggleBtn = document.querySelector("#tor-toggle-btn");
const torPanel = document.querySelector("#tor-panel");
const torTextarea = document.querySelector("#tor-textarea");
const torSubmitBtn = document.querySelector("#tor-submit-btn");

torToggleBtn.addEventListener("click", () => {
  torToggleBtn.classList.toggle("active");
  torPanel.classList.toggle("visible");
  if (torPanel.classList.contains("visible")) torTextarea.focus();
});

function renderTorTable(report) {
  const STATUS = { pass: ["status-pass", "ผ่าน ✓"], review: ["status-review", "⚠ ตรวจสอบ"], fail: ["status-fail", "ไม่ผ่าน ✗"], kb_insufficient: ["status-kb", "KB ไม่เพียงพอ"] };
  const OVERALL = { comply: "✅ ผ่านทุกข้อ", comply_with_review: "⚠️ ผ่าน (มีรายการต้องตรวจสอบ)", non_comply: "❌ ไม่ผ่าน", kb_insufficient: "⬜ KB ไม่เพียงพอ" };

  let html = `<div class="tor-result-wrap">
<strong>${escapeHtml(report.project_name)}</strong> — ผลตรวจสอบ ${report.items.length} รายการ<br><br>
<table class="tor-table">
<thead><tr><th>#</th><th>รายการ</th><th>จำนวน</th><th>รุ่นที่แนะนำ</th><th>คุณสมบัติ</th><th>ข้อกำหนด TOR</th><th>ค่าสินค้า</th><th>ผล</th><th>สถานะ</th></tr></thead><tbody>`;

  for (const item of report.items) {
    const checks = item.compliance_checks ?? [];
    const overallLabel = OVERALL[item.overall_status] ?? item.overall_status;
    const rowspan = Math.max(checks.length, 1);
    checks.forEach((c, i) => {
      const [cls, label] = STATUS[c.status] ?? ["", c.status];
      html += `<tr>`;
      if (i === 0) {
        html += `<td rowspan="${rowspan}">${escapeHtml(item.item_no)}</td>
<td rowspan="${rowspan}">${escapeHtml(item.category)}</td>
<td rowspan="${rowspan}" style="text-align:center">${item.quantity}</td>
<td rowspan="${rowspan}"><strong>${escapeHtml(item.recommended_model)}</strong><br><span style="font-size:11px;color:var(--ink-faint)">${escapeHtml(item.model_spec_summary)}</span></td>`;
      }
      html += `<td>${escapeHtml(c.spec_label)}</td><td>${escapeHtml(c.tor_requirement)}</td><td>${escapeHtml(c.product_value)}</td><td class="${cls}">${label}${c.note ? `<br><span style="font-size:11px;font-weight:400">${escapeHtml(c.note)}</span>` : ""}</td>`;
      if (i === 0) html += `<td rowspan="${rowspan}">${overallLabel}</td>`;
      html += `</tr>`;
    });
    if (checks.length === 0) {
      html += `<tr><td>${escapeHtml(item.item_no)}</td><td>${escapeHtml(item.category)}</td><td>${item.quantity}</td><td>${escapeHtml(item.recommended_model)}</td><td colspan="3" style="color:var(--ink-faint)">—</td><td>${overallLabel}</td></tr>`;
    }
  }
  html += `</tbody></table></div>`;

  const reviewItems = report.items.filter(i => i.presale_review_notes?.length);
  if (reviewItems.length) {
    html += `<br><strong>⚠️ รายการที่ต้องตรวจสอบก่อน bid:</strong><ul style="margin:6px 0 0 16px;font-size:13px">`;
    reviewItems.forEach(item => item.presale_review_notes.forEach(n => { html += `<li>${escapeHtml(n)}</li>`; }));
    html += `</ul>`;
  }
  return html;
}

torSubmitBtn.addEventListener("click", async () => {
  const torText = torTextarea.value.trim();
  if (!torText) return;
  torSubmitBtn.disabled = true;
  torPanel.classList.remove("visible");
  torToggleBtn.classList.remove("active");

  const es = document.querySelector("#empty-state");
  if (es) es.remove();

  // Show user bubble
  const preview = torText.slice(0, 120) + (torText.length > 120 ? "..." : "");
  appendUserBubble(`[TOR Compliance]\n${preview}`);
  startLoadingBubble();
  setStage("processing");

  try {
    const response = await fetch("/api/tor", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tor_text: torText })
    });
    if (response.status === 401) { window.location.replace("/login"); return; }
    if (response.status === 429) { stopLoadingBubble(); appendErrorBubble("ส่งข้อความถี่เกินไป — กรุณารอสักครู่แล้วลองใหม่"); setStage("ready"); return; }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", payload = null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n"); buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === "progress") updateLoadingProgress(event.step, event.total, event.label);
          else if (event.type === "done") payload = event;
        } catch (e) { console.warn("[SSE parse]", e); }
      }
    }
    stopLoadingBubble();

    if (!payload?.ok) { appendErrorBubble(payload?.error || "เกิดข้อผิดพลาด"); setStage("ready"); return; }

    const report = payload.report;
    const msg = document.createElement("div");
    msg.className = "message";
    msg.innerHTML = `<div class="message-label">Franky-Presale — TOR Compliance</div><div class="bubble assistant">${renderTorTable(report)}<br><a href="/api/tor/${encodeURIComponent(report.tor_id)}/export" download class="download-btn" style="margin-top:8px"><svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>Export Excel (.csv)</a></div>`;
    thread.appendChild(msg);
    scrollToBottom();
    setStage("ready");
    torTextarea.value = "";
  } catch (err) {
    stopLoadingBubble();
    console.error("[TOR]", err);
    const msg = document.createElement("div");
    msg.className = "message";
    msg.innerHTML = `<div class="message-label">Franky-Presale</div><div class="bubble assistant error-bubble">ไม่สามารถตรวจสอบ TOR ได้ — กรุณาลองใหม่<br><button class="retry-btn">↺ ลองอีกครั้ง</button></div>`;
    msg.querySelector(".retry-btn").addEventListener("click", () => { msg.remove(); torSubmitBtn.click(); });
    thread.appendChild(msg);
    scrollToBottom();
    setStage("ready");
  } finally {
    torSubmitBtn.disabled = false;
  }
});

async function syncSession() {
  const { response, payload } = await apiFetch("/api/auth/session", { method: "GET" });
  if (!response.ok || !payload.authenticated) { window.location.replace("/login"); return; }
  currentUser = payload.user;
  await loadProjects();
}

syncSession();
