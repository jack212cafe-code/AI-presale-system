/**
 * Drop-in replacement for lib/chat.js
 *
 * Change ONE line in server.js:
 *   import { handleChatMessage, withTimeout } from "./lib/chat.js";
 * to:
 *   import { handleChatMessage, withTimeout } from "./managed-agents/chat-managed.mjs";
 */

import {
  createConversation,
  getConversationById,
  addMessage,
  updateConversationStage,
} from "../lib/conversations.js";
import { createProjectRecord } from "../lib/projects.js";
import { normalizeIntakePayload } from "../lib/intake.js";
import { handleToolCall } from "./tool-handlers.mjs";
export { withTimeout } from "../lib/chat.js";
import { chat } from "./session.mjs";

export async function handleChatMessage({ conversationId, message, userId, onProgress }) {
  onProgress?.(1, 2, "Connecting to presale agent...");

  let conv = null;
  let projectId;

  if (!conversationId) {
    const intake = normalizeIntakePayload({
      customer_name: extractCustomerName(message) || "Chat Project",
      partner_type: "System Integrator",
      primary_use_case: message,
      core_pain_point: message,
      desired_outcome: message,
      trust_priority: "Reliability",
      notes: message,
    });

    const created = await createProjectRecord(intake, userId);
    projectId = created.project.id;

    const convRecord = await createConversation(projectId, userId);
    conversationId = convRecord.conversation.id;
  } else {
    conv = await getConversationById(conversationId);
    if (!conv) return { ok: false, error: "Conversation not found" };
    projectId = conv.project_id;
  }

  await addMessage(conversationId, "user", message);
  onProgress?.(2, 2, "กำลังเชื่อมต่อ Agent...");

  const TOOL_LABELS = {
    search_knowledge_base: "กำลังค้นหาข้อมูล KB...",
    get_project: "กำลังโหลดข้อมูล Project...",
    save_solution: "กำลังบันทึก Solution...",
    save_bom: "กำลังบันทึก BOM...",
  };

  let fullText = "";
  let toolCount = 0;
  await chat(projectId, message, (chunk) => {
    if (chunk.startsWith('{"type":')) {
      try {
        const evt = JSON.parse(chunk);
        if (evt.type === "agent.thinking") {
          onProgress?.(2, 2, "กำลังคิด...");
        } else if (evt.type === "agent.custom_tool_use") {
          toolCount++;
          const label = TOOL_LABELS[evt.tool_name] ?? `กำลังใช้ ${evt.tool_name}...`;
          onProgress?.(2, 2, `[${toolCount}] ${label}`);
        }
      } catch {}
    } else {
      fullText += chunk;
      onProgress?.(2, 2, "กำลังพิมพ์คำตอบ...");
    }
  }, userId);

  const text = fullText;

  await addMessage(conversationId, "assistant", text);

  const stage = inferStage(text, conv?.stage);
  await updateConversationStage(conversationId, stage);

  return {
    ok: true,
    conversation_id: conversationId,
    project_id: projectId,
    stage,
    text,
    created: !conv,
  };
}

function extractCustomerName(text) {
  const m = text.match(/(?:บริษัท|company|customer|client)[:\s]+([^\n,.]{2,40})/i);
  return m?.[1]?.trim() ?? null;
}

function inferStage(agentText, currentStage) {
  const t = agentText.toLowerCase();
  if (t.includes("bill of materials") || t.includes("bom") || t.includes("รายการอุปกรณ์")) return "bom";
  if (t.includes("proposal") || t.includes("ใบเสนอราคา") || t.includes("executive summary")) return "proposal_complete";
  if (t.includes("option") || t.includes("ทางเลือก") || t.includes("solution")) return "awaiting_selection";
  if (t.includes("?") || t.includes("ขอทราบ") || t.includes("คำถาม")) return "discovery_questions";
  return currentStage ?? "processing";
}
