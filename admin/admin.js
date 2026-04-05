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
    return true;
  }

  setLoginStatus("กรุณาเข้าสู่ระบบ");
  return false;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const password = new FormData(loginForm).get("password");
  setLoginStatus("กำลังตรวจสอบรหัสผ่าน...");

  const { response, payload } = await apiFetch("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ password })
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

syncSession();
