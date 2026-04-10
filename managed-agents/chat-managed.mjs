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
  onProgress?.(2, 2, "Agent thinking...");

  let fullText = "";
  await chat(projectId, message, (chunk) => {
    fullText += chunk;
    onProgress?.(2, 2, `Agent is typing... ${fullText.slice(-20)}...`);
    // We can't send the final text via onProgress easily without a custom event type,
    // but we ensure the connection stays alive.
  });

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
