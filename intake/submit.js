const thread = document.querySelector("#thread");
const form = document.querySelector("#chat-form");
const promptInput = document.querySelector("#prompt-input");
const sendButton = document.querySelector("#send-button");
const statusPill = document.querySelector("#status-pill");

const customerNameInput = document.querySelector("#customer-name");
const partnerTypeInput = document.querySelector("#partner-type");
const trustPriorityInput = document.querySelector("#trust-priority");
const desiredOutcomeInput = document.querySelector("#desired-outcome");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizePhrase(value) {
  return String(value || "")
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compactList(items, limit = 3) {
  return (Array.isArray(items) ? items : [])
    .map(normalizePhrase)
    .filter(Boolean)
    .slice(0, limit);
}

function inferPrimaryUseCase(message) {
  const content = String(message || "").toLowerCase();
  if (content.includes("backup")) return "Backup modernization";
  if (content.includes("dr") || content.includes("disaster")) return "Disaster recovery";
  if (content.includes("infra") || content.includes("refresh") || content.includes("hci")) return "Infrastructure refresh";
  if (content.includes("network")) return "Network modernization";
  return "General presale support";
}

function buildPayload(message) {
  return {
    customer_name: customerNameInput.value.trim() || "Untitled Partner",
    partner_type: partnerTypeInput.value.trim() || "System Integrator",
    primary_use_case: inferPrimaryUseCase(message),
    core_pain_point: message.trim(),
    desired_outcome: desiredOutcomeInput.value.trim() || "อยากได้คำตอบที่เอาไปคุยต่อได้",
    trust_priority: trustPriorityInput.value.trim() || "Accuracy first",
    notes: `Original brief: ${message.trim()}`
  };
}

function appendMessage(label, bodyHtml, role = "assistant") {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role === "user" ? "user" : ""}`;
  wrapper.innerHTML = `
    <div class="message-label">${escapeHtml(label)}</div>
    <div class="bubble ${role}">${bodyHtml}</div>
  `;
  thread.appendChild(wrapper);
  thread.scrollTop = thread.scrollHeight;
}

function appendAssistantRichReply(payload, requestPayload) {
  const requirements = payload.requirements || {};
  const gaps = compactList(requirements.gaps, 3);
  const summaryFocus = requestPayload.primary_use_case.toLowerCase();

  const questionList = gaps.length
    ? gaps.map((item) => `<div class="chip">${escapeHtml(item)}</div>`).join("")
    : `<div class="chip">ตอนนี้ข้อมูลตั้งต้นพอสำหรับเดินต่อได้</div>`;

  appendMessage(
    "Franky-Presale",
    `
      รับเคสนี้แล้วครับ ตอนนี้ผมมองว่าโจทย์หลักอยู่ที่ <strong>${escapeHtml(summaryFocus)}</strong>
      และเป้าหมายคือ <strong>${escapeHtml(requestPayload.desired_outcome.toLowerCase())}</strong>
      จากข้อมูลที่มีตอนนี้พอเริ่มวางทางได้แล้ว และผมพร้อมช่วยต่อให้เป็น solution brief หรือร่าง BOM เบื้องต้นได้

      <div class="assistant-blocks">
        <div class="next-card">
          <strong>คำถามสำคัญที่ควรถามเพิ่ม</strong>
          <div class="chip-list">${questionList}</div>
        </div>

        <div class="next-card">
          <strong>ขั้นถัดไป</strong>
          ถ้าคุณโอเคกับทิศทางนี้ ขั้นต่อไปคือให้ระบบช่วยออก solution brief และร่าง BOM เบื้องต้นต่อจากเคสนี้
        </div>
      </div>
    `
  );
}

function setStatus(text) {
  statusPill.textContent = text;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const message = promptInput.value.trim();
  if (!message) {
    return;
  }

  const payload = buildPayload(message);
  appendMessage("คุณ", escapeHtml(message), "user");
  appendMessage(
    "Franky-Presale",
    `
      <div class="typing">
        <span>กำลังวิเคราะห์เคสนี้</span>
        <span class="typing-dots"><span></span><span></span><span></span></span>
      </div>
    `,
    "assistant"
  );
  const pendingNode = thread.lastElementChild;

  promptInput.value = "";
  sendButton.disabled = true;
  setStatus("กำลังวิเคราะห์เคส...");

  try {
    const response = await fetch("/api/intake/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const responsePayload = await response.json();
    pendingNode.remove();

    if (!response.ok) {
      throw new Error(responsePayload.error || "ไม่สามารถประมวลผลเคสนี้ได้");
    }

    appendAssistantRichReply(responsePayload, payload);
    setStatus("ตอบกลับล่าสุดพร้อมแล้ว");
  } catch (error) {
    pendingNode.remove();
    appendMessage(
      "Franky-Presale",
      `
        <div class="banner error">ยังประมวลผลไม่สำเร็จ</div>
        <div style="margin-top:10px">${escapeHtml(error.message)}</div>
      `,
      "assistant"
    );
    setStatus("มีข้อผิดพลาด ลองส่งใหม่ได้");
  } finally {
    sendButton.disabled = false;
    promptInput.focus();
    thread.scrollTop = thread.scrollHeight;
  }
});
