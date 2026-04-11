/**
 * RUNTIME — one call per conversation turn.
 */

import Anthropic from "@anthropic-ai/sdk";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "dotenv";
import { handleToolCall, getSessionId, saveSessionId } from "./tool-handlers.mjs";
import { writeAgentLog } from "../lib/supabase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

config();
config({ path: path.join(__dirname, ".env.managed-agents") });

let client;
let AGENT_ID;
let ENV_ID;

function ensureInitialized() {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    AGENT_ID = process.env.MANAGED_AGENT_ID;
    ENV_ID = process.env.MANAGED_AGENT_ENV_ID;

    if (!AGENT_ID || !ENV_ID) {
      throw new Error(
        "MANAGED_AGENT_ID / MANAGED_AGENT_ENV_ID not set. Run: node managed-agents/setup.mjs",
      );
    }
  }
}

/**
 * Send a message and wait for full response.
 * Resumes the existing session for the project (creates one on first call).
 *
 * @param {string} projectId
 * @param {string} userText
 * @param {(chunk: string) => void} [onStream]
 * @returns {Promise<{ text: string }>}
 */
export async function chat(projectId, userText, onStream) {
  ensureInitialized();
  const sessionId = await getOrCreateSession(projectId);
  return runTurn(sessionId, projectId, userText, onStream);
}

// ── Session management ────────────────────────────────────────────────────────

async function getOrCreateSession(projectId) {
  const existing = await getSessionId(projectId);

  if (existing) {
    try {
      const s = await client.beta.sessions.retrieve(existing);
      if (s.status !== "terminated") return existing;
    } catch {
      // session gone — fall through to create
    }
  }

  const session = await client.beta.sessions.create({
    agent: AGENT_ID,
    environment_id: ENV_ID,
    title: `Presale: ${projectId}`,
    metadata: { project_id: projectId },
  });

  await saveSessionId(projectId, session.id);
  return session.id;
}

// ── Event loop ────────────────────────────────────────────────────────────────

async function runTurn(sessionId, projectId, userText, onStream, userId) {
  const responseChunks = [];
  const startMs = Date.now();

  const seenEventIds = new Set();
  const toolResultStore = new Map(); // eventId → result event object

  // Queue of events to submit — first item is always the user message
  const submitQueue = [
    { type: "user.message", content: [{ type: "text", text: userText }] },
  ];

  // Core pattern: open stream FIRST, then submit, then read events.
  // This ensures we never miss events that fire between submit and stream open.
  let finalDone = false;
  while (!finalDone) {
    const pendingTools = [];
    // 1. Open stream BEFORE submitting anything
    const stream = await client.beta.sessions.events.stream(sessionId);

    // 2. Submit queued event (user message or tool result)
    if (submitQueue.length > 0) {
      const toSend = submitQueue.shift();
      try {
        console.log(`[Agent Send] type: ${toSend.type}`);
        await client.beta.sessions.events.send(sessionId, { events: [toSend] });
      } catch (error) {
        if (error.message?.includes("waiting on responses")) {
          throw new Error("Agent is still processing a previous request. Please wait a moment.");
        }
        throw error;
      }
    }

    // 3. Read events from stream
    for await (const event of stream) {
      if (event.id && seenEventIds.has(event.id)) continue;
      if (event.id) seenEventIds.add(event.id);

      console.log(`[Agent Event] type: ${event.type}`, JSON.stringify(event).slice(0, 200));

      if (event.type === "agent.message") {
        for (const block of event.content) {
          if (block.type === "text") {
            responseChunks.push(block.text);
            onStream?.(block.text);
          }
        }
      } else if (event.type === "agent.thinking") {
        onStream?.(JSON.stringify({ type: "agent.thinking" }));
      } else if (event.type === "agent.custom_tool_use") {
        if (!toolResultStore.has(event.id)) {
          const toolName = event.tool_name || event.name;
          onStream?.(JSON.stringify({ type: "agent.custom_tool_use", tool_name: toolName }));
          console.log(`[Agent Tool] Calling: ${toolName}`);
          pendingTools.push({ id: event.id, name: toolName, input: event.input });
        }
      } else if (event.type === "session.status_idle") {
        const requiredIds = event.stop_reason?.event_ids || [];

        // Execute NEW tool calls in parallel, store results
        if (pendingTools.length > 0) {
          console.log(`[Agent Action] Executing ${pendingTools.length} tools...`);
          await Promise.all(
            pendingTools.map(async (tool) => {
              const result = await handleToolCall(tool.name, tool.input);
              console.log(`[Tool Result] ${tool.name} done`);
              toolResultStore.set(tool.id, {
                type: "user.custom_tool_result",
                custom_tool_use_id: tool.id,
                content: [{ type: "text", text: JSON.stringify(result) }],
              });
            })
          );
        }

        // Queue ONE stored result that the API still requires
        const nextToSubmit = requiredIds.find((id) => toolResultStore.has(id));
        if (nextToSubmit) {
          submitQueue.push(toolResultStore.get(nextToSubmit));
          toolResultStore.delete(nextToSubmit);
          console.log(`[Agent Queue] Will submit result for ${nextToSubmit}`);
          break; // reopen stream, then submit
        }

        finalDone = true;
        break;
      } else if (event.type === "session.status_terminated") {
        finalDone = true;
        break;
      }
    }

    if (!finalDone && submitQueue.length === 0 && toolResultStore.size === 0) {
      finalDone = true;
    }
  }

  const text = responseChunks.join("");
  writeAgentLog({
    project_id: projectId ?? null,
    agent_name: "managed-agent",
    model_used: "claude-sonnet-4-6",
    tokens_used: 0,
    cost_usd: 0,
    duration_ms: Date.now() - startMs,
    status: "success",
  }).catch((e) => console.warn("[audit] log write failed:", e.message));
  return { text };
}
