const loginPanel = document.querySelector("#login-panel");
const portalLayout = document.querySelector("#portal-layout");
const loginForm = document.querySelector("#login-form");
const loginStatus = document.querySelector("#login-status");
const logoutButton = document.querySelector("#logout-button");
const uploadForm = document.querySelector("#upload-form");
const fileInput = document.querySelector("#file-input");
const statusBox = document.querySelector("#status");
const docList = document.querySelector("#doc-list");
const refreshButton = document.querySelector("#refresh-button");
const reloadDocsButton = document.querySelector("#reload-docs-button");
const uploadButton = document.querySelector("#upload-button");
const progressBox = document.querySelector("#progress-box");
const progressFill = document.querySelector("#progress-fill");
const progressMeta = document.querySelector("#progress-meta");

let activeJobId = null;
let activeJobTimer = null;

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(message, type = "info") {
  statusBox.textContent = message;
  statusBox.className = type === "error" ? "status error" : type === "success" ? "status" : "status neutral";
}

function setLoginStatus(message, type = "info") {
  loginStatus.textContent = message;
  loginStatus.className = type === "error" ? "status error" : type === "success" ? "status" : "status neutral";
}

function setPortalVisibility(authenticated) {
  loginPanel.classList.toggle("hidden", authenticated);
  portalLayout.classList.toggle("hidden", !authenticated);
}

function setProgress(progressPercent, message) {
  progressBox.classList.remove("hidden");
  progressFill.style.width = `${Math.max(0, Math.min(100, Number(progressPercent) || 0))}%`;
  progressMeta.textContent = message;
}

function resetProgress() {
  progressBox.classList.add("hidden");
  progressFill.style.width = "0%";
  progressMeta.textContent = "ยังไม่มีงาน import ที่กำลังทำงาน";
}

function stopPollingJob() {
  if (activeJobTimer) {
    window.clearTimeout(activeJobTimer);
    activeJobTimer = null;
  }
}

async function fileToBase64(file) {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const slice = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...slice);
  }

  return btoa(binary);
}

function renderDocuments(documents) {
  if (!Array.isArray(documents) || documents.length === 0) {
    docList.innerHTML = '<div class="empty">ยังไม่มีเอกสารถูก import เข้าระบบ</div>';
    return;
  }

  docList.innerHTML = documents
    .map(
      (document) => `
        <article class="doc-card">
          <div class="doc-head">
            <div>
              <h3>${escapeHtml(document.title || document.source_file)}</h3>
              <p class="doc-path">${escapeHtml(document.source_file)}</p>
              <p class="doc-meta">
                ${escapeHtml(document.vendor || "Unknown vendor")} |
                ${escapeHtml(document.document_type || "Unknown type")} |
                ${escapeHtml(document.category || "Unknown category")} |
                ${document.chunk_count} chunks
              </p>
            </div>
            <button type="button" class="danger" data-delete="${encodeURIComponent(document.source_file)}">Delete</button>
          </div>
          <div class="chips">
            ${(document.tags || []).map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join("")}
          </div>
        </article>
      `
    )
    .join("");
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function loadDocuments() {
  docList.innerHTML = '<div class="empty">กำลังโหลดรายการเอกสาร...</div>';

  try {
    const { response, payload } = await apiFetch("/api/admin/kb/documents", {
      method: "GET"
    });

    if (!response.ok) {
      throw new Error(payload.error || "Failed to load documents");
    }

    renderDocuments(payload.documents || []);
  } catch (error) {
    docList.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

async function pollJob(jobId) {
  activeJobId = jobId;

  try {
    const { response, payload } = await apiFetch(`/api/admin/kb/jobs/${encodeURIComponent(jobId)}`, {
      method: "GET"
    });

    if (!response.ok) {
      throw new Error(payload.error || "Failed to load job");
    }

    const job = payload.job;
    setProgress(job.progress_percent, `${job.stage}: ${job.message}`);

    if (job.status === "completed") {
      setStatus("Import สำเร็จแล้ว");
      uploadButton.disabled = false;
      activeJobId = null;
      stopPollingJob();
      await loadDocuments();
      return;
    }

    if (job.status === "failed") {
      setStatus(job.error || job.message || "Import failed", "error");
      uploadButton.disabled = false;
      activeJobId = null;
      stopPollingJob();
      return;
    }

    activeJobTimer = window.setTimeout(() => pollJob(jobId), 1200);
  } catch (error) {
    setStatus(error.message, "error");
    uploadButton.disabled = false;
    activeJobId = null;
    stopPollingJob();
  }
}

async function syncSession() {
  const { response, payload } = await apiFetch("/api/admin/session", { method: "GET" });

  if (response.status === 503) {
    setPortalVisibility(false);
    setLoginStatus("ระบบยังไม่ได้ตั้งค่า ADMIN_PORTAL_PASSWORD", "error");
    return false;
  }

  if (!response.ok) {
    setPortalVisibility(false);
    setLoginStatus(payload.error || "Session check failed", "error");
    return false;
  }

  setPortalVisibility(Boolean(payload.authenticated));
  if (payload.authenticated) {
    resetProgress();
    setStatus("พร้อมใช้งาน");
    await loadDocuments();
    await loadCorrections();
    await loadAuditTrail();
    await loadUsers();
    await loadFeedback();
    return true;
  }

  setLoginStatus("กรุณาเข้าสู่ระบบ");
  return false;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const username = new FormData(loginForm).get("username");
  const password = new FormData(loginForm).get("password");
  setLoginStatus("กำลังตรวจสอบ...");

  const { response, payload } = await apiFetch("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });

  if (!response.ok) {
    setLoginStatus(payload.error || "Login failed", "error");
    return;
  }

  loginForm.reset();
  setLoginStatus("เข้าสู่ระบบสำเร็จ");
  await syncSession();
});

logoutButton.addEventListener("click", async () => {
  stopPollingJob();
  activeJobId = null;

  await apiFetch("/api/admin/logout", {
    method: "POST",
    body: JSON.stringify({})
  });

  setPortalVisibility(false);
  setLoginStatus("ออกจากระบบแล้ว");
});

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const file = fileInput.files?.[0];
  if (!file) {
    setStatus("กรุณาเลือกไฟล์ก่อน import", "error");
    return;
  }

  stopPollingJob();
  activeJobId = null;
  uploadButton.disabled = true;
  setStatus("กำลังอัปโหลดไฟล์และสร้างงาน import...");
  setProgress(5, "uploading: Uploading file to server");

  try {
    const formData = Object.fromEntries(new FormData(uploadForm).entries());
    const content_base64 = await fileToBase64(file);

    const { response, payload } = await apiFetch("/api/admin/kb/upload", {
      method: "POST",
      body: JSON.stringify({
        ...formData,
        file_name: file.name,
        content_base64
      })
    });

    if (!response.ok) {
      throw new Error(payload.error || "Import failed");
    }

    uploadForm.reset();
    setStatus(`สร้างงาน import แล้ว: ${payload.source_file}`);
    setProgress(10, "queued: Waiting for import worker");
    await pollJob(payload.job_id);
  } catch (error) {
    uploadButton.disabled = false;
    setStatus(error.message, "error");
  }
});

docList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete]");
  if (!button) {
    return;
  }

  const sourceFile = decodeURIComponent(button.dataset.delete);
  const confirmed = window.confirm(`ลบเอกสาร ${sourceFile} ออกจากระบบ?`);
  if (!confirmed) {
    return;
  }

  button.disabled = true;
  setStatus(`กำลังลบ ${sourceFile} ...`);

  try {
    const { response, payload } = await apiFetch("/api/admin/kb/documents", {
      method: "DELETE",
      body: JSON.stringify({ source_file: sourceFile })
    });

    if (!response.ok) {
      throw new Error(payload.error || "Delete failed");
    }

    setStatus(`ลบเอกสารแล้ว: ${sourceFile}`);
    await loadDocuments();
  } catch (error) {
    setStatus(error.message, "error");
    button.disabled = false;
  }
});

refreshButton.addEventListener("click", () => {
  loadDocuments();
});

reloadDocsButton.addEventListener("click", () => {
  loadDocuments();
});

// ── Feedback UI ───────────────────────────────────────────────────────────────

const feedbackList = document.querySelector("#feedback-list");
const reloadFeedbackBtn = document.querySelector("#reload-feedback-btn");

async function loadFeedback() {
  feedbackList.innerHTML = '<div class="empty" style="margin:16px 22px">กำลังโหลด...</div>';
  try {
    const { response, payload } = await apiFetch("/api/admin/feedback", { method: "GET" });
    if (!response.ok) throw new Error(payload.error || "Load failed");
    const rows = payload.feedback ?? [];
    if (rows.length === 0) {
      feedbackList.innerHTML = '<div class="empty" style="margin:16px 22px">ยังไม่มีข้อมูล feedback</div>';
      return;
    }
    feedbackList.innerHTML = `
      <table class="audit-table">
        <thead><tr>
          <th>Customer</th><th>Rating</th><th>Date</th>
        </tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td>${escapeHtml(r.projects?.customer_name || "Unknown")}</td>
          <td><span class="status-pill ${r.rating === 1 ? "success" : "error"}">${r.rating === 1 ? "👍 Up" : "👎 Down"}</span></td>
          <td>${new Date(r.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}</td>
        </tr>`).join("")}</tbody>
      </table>`;
  } catch (error) {
    feedbackList.innerHTML = `<div class="empty" style="margin:16px 22px">${escapeHtml(error.message)}</div>`;
  }
}

reloadFeedbackBtn?.addEventListener("click", () => loadFeedback());

// ── Corrections UI ────────────────────────────────────────────────────────────

const correctionForm = document.querySelector("#correction-form");
const corrStatus = document.querySelector("#corr-status");
const correctionsList = document.querySelector("#corrections-list");
const reloadCorrectionsBtn = document.querySelector("#reload-corrections-btn");
const aggregateBtn = document.querySelector("#aggregate-btn");

function setCorrStatus(msg, type = "ok") {
  corrStatus.textContent = msg;
  corrStatus.style.color = type === "error" ? "var(--red)" : "var(--green)";
}

async function loadCorrections() {
  correctionsList.innerHTML = '<div class="empty">กำลังโหลด...</div>';
  try {
    const { response, payload } = await apiFetch("/api/admin/corrections", { method: "GET" });
    if (!response.ok) throw new Error(payload.error || "Load failed");
    const rows = payload.corrections ?? [];
    if (rows.length === 0) {
      correctionsList.innerHTML = '<div class="empty">ยังไม่มี correction ที่บันทึกไว้</div>';
      return;
    }
    correctionsList.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="text-align:left;border-bottom:1px solid var(--border-strong)">
        <th style="padding:6px 8px">Field</th>
        <th style="padding:6px 8px">Wrong</th>
        <th style="padding:6px 8px">Correct</th>
        <th style="padding:6px 8px">Note</th>
        <th style="padding:6px 8px">Date</th>
      </tr></thead>
      <tbody>${rows.map(r => `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:6px 8px;font-weight:500">${escapeHtml(r.field)}</td>
        <td style="padding:6px 8px;color:var(--red)">${escapeHtml(r.wrong_value)}</td>
        <td style="padding:6px 8px;color:var(--green)">${escapeHtml(r.correct_value)}</td>
        <td style="padding:6px 8px;color:var(--ink-dim)">${escapeHtml(r.note)}</td>
        <td style="padding:6px 8px;color:var(--ink-faint)">${new Date(r.created_at).toLocaleDateString("th-TH")}</td>
      </tr>`).join("")}</tbody>
    </table>`;
  } catch (error) {
    correctionsList.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

correctionForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const projectId = document.querySelector("#corr-project-id").value.trim() || null;
  const field = document.querySelector("#corr-field").value.trim();
  const wrongValue = document.querySelector("#corr-wrong").value.trim();
  const correctValue = document.querySelector("#corr-correct").value.trim();
  const note = document.querySelector("#corr-note").value.trim();

  setCorrStatus("กำลังบันทึก...");
  try {
    const endpoint = projectId
      ? `/api/projects/${encodeURIComponent(projectId)}/corrections`
      : "/api/projects/general/corrections";
    const { response, payload } = await apiFetch(endpoint, {
      method: "POST",
      body: JSON.stringify({ field, wrong_value: wrongValue, correct_value: correctValue, note })
    });
    if (!response.ok) throw new Error(payload.error || "Save failed");
    setCorrStatus("บันทึกแล้ว");
    correctionForm.reset();
    await loadCorrections();
  } catch (error) {
    setCorrStatus(error.message, "error");
  }
});

aggregateBtn?.addEventListener("click", async () => {
  if (!confirm("ยืนยันการ Push corrections เข้า KB? ข้อมูลที่มีอยู่ใน KB จะถูก overwrite")) return;
  aggregateBtn.disabled = true;
  aggregateBtn.textContent = "กำลัง push...";
  try {
    const { response, payload } = await apiFetch("/api/admin/corrections/aggregate", { method: "POST" });
    if (!response.ok) throw new Error(payload.error || "Aggregate failed");
    setCorrStatus(`Push สำเร็จ — ${payload.kb_entries_upserted} KB entries updated`);
  } catch (error) {
    setCorrStatus(error.message, "error");
  } finally {
    aggregateBtn.disabled = false;
    aggregateBtn.textContent = "Push to KB";
  }
});

reloadCorrectionsBtn?.addEventListener("click", () => loadCorrections());

const auditList = document.querySelector("#audit-list");
const reloadAuditBtn = document.querySelector("#reload-audit-btn");

async function loadAuditTrail() {
  auditList.innerHTML = '<div class="empty" style="margin:16px 22px">กำลังโหลด...</div>';
  try {
    const { response, payload } = await apiFetch("/api/admin/audit", { method: "GET" });
    if (!response.ok) throw new Error(payload.error || "Load failed");
    const logs = payload.logs ?? [];
    if (logs.length === 0) {
      auditList.innerHTML = '<div class="empty" style="margin:16px 22px">ยังไม่มี agent logs</div>';
      return;
    }
    const totalCost = logs.reduce((s, r) => s + (r.cost_usd ?? 0), 0);
    auditList.innerHTML = `
      <div style="padding:10px 22px 6px;font-size:12.5px;color:var(--ink-dim)">
        ${logs.length} calls · รวม $${totalCost.toFixed(4)} USD
      </div>
      <table class="audit-table">
        <thead><tr>
          <th>Agent</th><th>Model</th><th>Tokens</th>
          <th>Cost (USD)</th><th>Duration</th><th>Status</th><th>Date</th>
        </tr></thead>
        <tbody>${logs.map(r => `<tr>
          <td>${escapeHtml(r.agent_name)}</td>
          <td>${escapeHtml(r.model_used ?? "—")}</td>
          <td>${(r.tokens_used ?? 0).toLocaleString()}</td>
          <td>$${(r.cost_usd ?? 0).toFixed(4)}</td>
          <td>${r.duration_ms ? r.duration_ms + "ms" : "—"}</td>
          <td><span class="status-pill ${r.status === "error" ? "error" : "success"}">${escapeHtml(r.status ?? "—")}</span></td>
          <td>${new Date(r.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
        </tr>`).join("")}</tbody>
      </table>
    `;
  } catch (error) {
    auditList.innerHTML = `<div class="empty" style="margin:16px 22px">${escapeHtml(error.message)}</div>`;
  }
}

reloadAuditBtn?.addEventListener("click", () => loadAuditTrail());

// ── User Management ───────────────────────────────────────────────────────────

const usersList = document.querySelector("#users-list");
const reloadUsersBtn = document.querySelector("#reload-users-btn");
const createUserForm = document.querySelector("#create-user-form");
const userCreateStatus = document.querySelector("#user-create-status");

const ROLE_LABELS = { admin: "Admin", manager: "Manager", engineer: "Engineer" };

function renderUsers(users) {
  if (!Array.isArray(users) || users.length === 0) {
    usersList.innerHTML = '<div class="empty" style="margin:16px 22px">ยังไม่มี users</div>';
    return;
  }
  usersList.innerHTML = `<table class="audit-table">
    <thead><tr>
      <th>Username</th><th>Display Name</th><th>Role</th><th>Joined</th><th></th>
    </tr></thead>
    <tbody>${users.map(u => `<tr data-user-id="${escapeHtml(u.id)}">
      <td>${escapeHtml(u.username)}</td>
      <td>${escapeHtml(u.display_name)}</td>
      <td>
        <select class="role-select" data-user-id="${escapeHtml(u.id)}" style="font-size:12.5px;padding:3px 6px;border-radius:5px;border:1px solid var(--border-strong);background:var(--surface-2)">
          ${["engineer","manager","admin"].map(r => `<option value="${r}" ${r === u.role ? "selected" : ""}>${ROLE_LABELS[r]}</option>`).join("")}
        </select>
      </td>
      <td>${u.created_at ? new Date(u.created_at).toLocaleDateString("th-TH") : "—"}</td>
      <td><button type="button" class="danger" style="font-size:12px;padding:4px 10px" data-delete-user="${escapeHtml(u.id)}">Delete</button></td>
    </tr>`).join("")}</tbody>
  </table>`;
}

async function loadUsers() {
  usersList.innerHTML = '<div class="empty" style="margin:16px 22px">กำลังโหลด...</div>';
  try {
    const { response, payload } = await apiFetch("/api/admin/users", { method: "GET" });
    if (!response.ok) throw new Error(payload.error || "Load failed");
    renderUsers(payload.users ?? []);
  } catch (error) {
    usersList.innerHTML = `<div class="empty" style="margin:16px 22px">${escapeHtml(error.message)}</div>`;
  }
}

usersList?.addEventListener("change", async (event) => {
  const select = event.target.closest(".role-select");
  if (!select) return;
  const userId = select.dataset.userId;
  const role = select.value;
  try {
    const { response, payload } = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: JSON.stringify({ role })
    });
    if (!response.ok) throw new Error(payload.error || "Update failed");
  } catch (error) {
    alert(error.message);
    await loadUsers();
  }
});

usersList?.addEventListener("click", async (event) => {
  const btn = event.target.closest("[data-delete-user]");
  if (!btn) return;
  const userId = btn.dataset.deleteUser;
  if (!window.confirm("ลบ user นี้?")) return;
  btn.disabled = true;
  try {
    const { response, payload } = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
    if (!response.ok) throw new Error(payload.error || "Delete failed");
    await loadUsers();
  } catch (error) {
    alert(error.message);
    btn.disabled = false;
  }
});

createUserForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  userCreateStatus.textContent = "กำลังสร้าง...";
  userCreateStatus.style.color = "var(--ink-dim)";
  try {
    const { response, payload } = await apiFetch("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        username: document.querySelector("#new-username").value.trim(),
        password: document.querySelector("#new-password").value,
        display_name: document.querySelector("#new-display-name").value.trim(),
        role: document.querySelector("#new-role").value
      })
    });
    if (!response.ok) throw new Error(payload.error || "Create failed");
    userCreateStatus.textContent = `สร้าง user แล้ว: ${payload.user.username}`;
    userCreateStatus.style.color = "var(--green)";
    createUserForm.reset();
    await loadUsers();
  } catch (error) {
    userCreateStatus.textContent = error.message;
    userCreateStatus.style.color = "var(--red)";
  }
});

reloadUsersBtn?.addEventListener("click", () => loadUsers());

syncSession();
