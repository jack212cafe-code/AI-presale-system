/**
 * RUNTIME — one call per conversation turn.
 */

import Anthropic from "@anthropic-ai/sdk";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "dotenv";
import { handleToolCall, getSessionId, saveSessionId } from "./tool-handlers.mjs";

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

async function runTurn(sessionId, projectId, userText, onStream) {
  const responseChunks = [];
  const pendingTools = [];

  // Pattern 7: open stream BEFORE sending
  const stream = await client.beta.sessions.events.stream(sessionId);

  await client.beta.sessions.events.send(sessionId, {
    events: [{ type: "user.message", content: [{ type: "text", text: userText }] }],
  });

  for await (const event of stream) {
    if (event.type === "agent.message") {
      for (const block of event.content) {
        if (block.type === "text") {
          responseChunks.push(block.text);
          onStream?.(block.text);
        }
      }
    } else if (event.type === "agent.custom_tool_use") {
      pendingTools.push({
        id: event.id,
        name: event.tool_name,
        input: event.input,
      });
    } else if (event.type === "session.status_idle") {
      if (event.stop_reason?.type === "requires_action" && pendingTools.length > 0) {
        const results = await Promise.all(
          pendingTools.map(async (tool) => {
            const result = await handleToolCall(tool.name, tool.input);
            return {
              type: "user.custom_tool_result",
              custom_tool_use_id: tool.id,
              content: [{ type: "text", text: JSON.stringify(result) }],
            };
          }),
        );
        pendingTools.length = 0;
        await client.beta.sessions.events.send(sessionId, { events: results });
        continue;
      }
      break;
    } else if (event.type === "session.status_terminated") {
      break;
    }
  }

  return { text: responseChunks.join("") };
}
