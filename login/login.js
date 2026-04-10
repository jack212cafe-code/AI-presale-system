const loginForm = document.querySelector("#login-form");
const errorMsg = document.querySelector("#error-msg");
const loginBtn = document.querySelector("#login-btn");

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function showError(message) {
  errorMsg.textContent = message;
  errorMsg.classList.add("visible");
}

function hideError() {
  errorMsg.classList.remove("visible");
}

async function checkSession() {
  try {
    const { response, payload } = await apiFetch("/api/auth/session", { method: "GET" });
    if (response.ok && payload.authenticated) {
      window.location.replace("/chat");
    }
  } catch (e) {
    // Not authenticated — stay on login page
  }
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError();
  loginBtn.disabled = true;

  try {
    const { response, payload } = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: document.querySelector("#username").value,
        password: document.querySelector("#password").value
      })
    });

    if (!response.ok) {
      showError(payload.error || "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
      loginBtn.disabled = false;
      return;
    }

    window.location.replace("/chat");
  } catch (error) {
    showError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
    loginBtn.disabled = false;
  }
});

checkSession();
