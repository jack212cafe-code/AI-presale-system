import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";

process.env.AI_PRESALE_FORCE_LOCAL = "1";
process.env.ADMIN_PORTAL_PASSWORD = "test-admin-password";

const { createAppServer } = await import("../server.js");
const { createUserSession, buildUserSessionCookie } = await import("../lib/user-auth.js");

let server;
let baseUrl;

before(async () => {
  server = createAppServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(() => {
  server.close();
});

async function makeAuthenticatedRequest(method, path, body) {
  const token = createUserSession("test-user-id", "Test User");
  const cookie = buildUserSessionCookie(token);
  const opts = {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie }
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${baseUrl}${path}`, opts);
  const responseBody = await res.json();
  return { statusCode: res.status, body: responseBody };
}

describe("POST /api/chat", () => {
  it("POST /api/chat without auth returns 401", async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "test" })
    });
    const body = await res.json();
    assert.equal(res.status, 401);
    assert.equal(body.ok, false);
  });

  it("POST /api/chat with empty message returns 400", async () => {
    const { statusCode, body } = await makeAuthenticatedRequest("POST", "/api/chat", { message: "" });
    assert.equal(statusCode, 400);
    assert.match(body.error, /message is required/i);
  });

  it("POST /api/chat with missing message field returns 400", async () => {
    const { statusCode } = await makeAuthenticatedRequest("POST", "/api/chat", {});
    assert.equal(statusCode, 400);
  });

  it("POST /api/chat first message creates conversation", async () => {
    const { statusCode, body } = await makeAuthenticatedRequest("POST", "/api/chat", {
      message: "HCI + Backup for 100 users"
    });
    assert.equal(statusCode, 201);
    assert.equal(body.ok, true);
    assert.equal(typeof body.conversation_id, "string");
    assert.ok(body.conversation_id.length > 0);
    assert.equal(typeof body.project_id, "string");
    assert.ok(body.project_id.length > 0);
    assert.equal(typeof body.stage, "string");
    assert.ok(body.stage.length > 0);
    assert.equal(typeof body.text, "string");
    assert.ok(body.text.length > 0);
  });

  it("POST /api/chat with invalid conversation_id returns error", async () => {
    const { statusCode, body } = await makeAuthenticatedRequest("POST", "/api/chat", {
      conversation_id: "00000000-0000-0000-0000-000000000000",
      message: "hello"
    });
    // In local/mock mode getConversationById returns null → returns stage:error body (200) or 500
    const isErrorResponse = statusCode >= 400 || body.ok === false || body.stage === "error";
    assert.ok(isErrorResponse, `Expected error response, got status=${statusCode} body=${JSON.stringify(body)}`);
  });

  // NOTE: Multi-turn test (test 5) requires Supabase to persist and retrieve conversations.
  // In local/mock mode, getConversationById returns null after the first message, so this
  // test is skipped in local mode and documented here for Supabase-connected environments.
  //
  // To run manually with Supabase:
  //   1. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in environment
  //   2. Remove AI_PRESALE_FORCE_LOCAL=1 override
  //   3. Run: node --test test/chat.test.js
  //
  // Expected behavior:
  //   - First message returns conversation_id + stage:awaiting_selection
  //   - Second message with conversation_id + "1" returns stage:complete with BOM text
});
