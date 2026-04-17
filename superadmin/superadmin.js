const loginCard = document.getElementById("login-card");
const dashboardCard = document.getElementById("dashboard-card");
const errorMsg = document.getElementById("error-msg");
const errorMsg2 = document.getElementById("error-msg2");
const loginBtn = document.getElementById("login-btn");
const orgsTbody = document.getElementById("orgs-tbody");
const orgCount = document.getElementById("org-count");

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function showError(el, message) {
  el.textContent = message;
  el.classList.add("visible");
}

function hideError(el) {
  el.classList.remove("visible");
}

async function checkSession() {
  const { response, payload } = await apiFetch("/api/superadmin/session", { method: "GET" });
  if (response.ok && payload.authenticated) {
    showDashboard();
    loadOrgs();
  }
}

async function login(password) {
  const { response, payload } = await apiFetch("/api/superadmin/login", {
    method: "POST",
    body: JSON.stringify({ password })
  });
  if (!response.ok) {
    showError(errorMsg, payload.error || "Login failed");
    return false;
  }
  showDashboard();
  loadOrgs();
  return true;
}

async function loadOrgs() {
  hideError(errorMsg2);
  const { response, payload } = await apiFetch("/api/superadmin/orgs", { method: "GET" });
  if (!response.ok) {
    showError(errorMsg2, payload.error || "Failed to load orgs");
    return;
  }
  orgCount.textContent = payload.orgs?.length ?? 0;
  orgsTbody.innerHTML = "";
  for (const org of payload.orgs ?? []) {
    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid var(--border)";
    const statusColor = org.status === "active" ? "#27AE60" : org.status === "suspended" ? "#C0392B" : "#E67E22";
    const action = org.status === "suspended"
      ? `<button onclick="setOrgStatus('${org.id}', 'active')" style="background:#27AE60;color:#fff;border:none;border-radius:6px;padding:5px 12px;cursor:pointer;font-size:13px;">เปิดใช้งาน</button>`
      : `<button onclick="setOrgStatus('${org.id}', 'suspended')" style="background:#C0392B;color:#fff;border:none;border-radius:6px;padding:5px 12px;cursor:pointer;font-size:13px;">ระงับ</button>`;
    tr.innerHTML = `
      <td style="padding:10px 12px;">${escapeHtml(org.name)}</td>
      <td style="padding:10px 12px;">${org.user_count ?? 0}</td>
      <td style="padding:10px 12px;color:${statusColor};font-weight:600;">${org.status}</td>
      <td style="padding:10px 12px;">${action}</td>
    `;
    orgsTbody.appendChild(tr);
  }
}

async function setOrgStatus(orgId, status) {
  const { response, payload } = await apiFetch(`/api/superadmin/orgs/${orgId}/${status}`, { method: "POST" });
  if (!response.ok) {
    showError(errorMsg2, payload.error || "Failed to update org");
    return;
  }
  loadOrgs();
}

async function logout() {
  await apiFetch("/api/superadmin/logout", { method: "POST" });
  dashboardCard.style.display = "none";
  loginCard.style.display = "block";
}

function showDashboard() {
  loginCard.style.display = "none";
  dashboardCard.style.display = "block";
}

function escapeHtml(str) {
  return String(str ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError(errorMsg);
  loginBtn.disabled = true;
  const ok = await login(document.getElementById("password").value);
  loginBtn.disabled = false;
  if (!ok) loginBtn.disabled = false;
});

checkSession();
