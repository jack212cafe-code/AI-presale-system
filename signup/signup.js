const form = document.querySelector("#signup-form");
const errorMsg = document.querySelector("#error-msg");
const signupBtn = document.querySelector("#signup-btn");

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

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError();

  const company = document.querySelector("#company").value.trim();
  const username = document.querySelector("#username").value.trim();
  const password = document.querySelector("#password").value;
  const confirm = document.querySelector("#confirm").value;

  if (!company) { showError("กรุณากรอกชื่อบริษัท"); return; }
  if (username.length < 3) { showError("ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร"); return; }
  if (password.length < 6) { showError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"); return; }
  if (password !== confirm) { showError("รหัสผ่านไม่ตรงกัน"); return; }

  signupBtn.disabled = true;

  try {
    const { response, payload } = await apiFetch("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ company, username, password })
    });

    if (!response.ok) {
      showError(payload.error || "สมัครใช้งานไม่สำเร็จ กรุณาลองใหม่");
      signupBtn.disabled = false;
      return;
    }

    window.location.replace("/intake");
  } catch (error) {
    showError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
    signupBtn.disabled = false;
  }
});
