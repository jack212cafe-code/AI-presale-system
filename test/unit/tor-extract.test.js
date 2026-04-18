import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";

process.env.AI_PRESALE_FORCE_LOCAL = "1";
process.env.ADMIN_PORTAL_PASSWORD = "test-admin-password";

const { createAppServer } = await import("../../server.js");
const { createUserSession, buildUserSessionCookie } = await import("../../lib/user-auth.js");

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

test("POST /api/tor/extract returns 401 without auth", async () => {
  const res = await fetch(`${baseUrl}/api/tor/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_name: "x.txt", content_base64: Buffer.from("hi").toString("base64") })
  });
  assert.equal(res.status, 401);
});

test("POST /api/tor/extract returns text for authenticated .txt upload", async () => {
  const token = await createUserSession("test-uuid-extract", "Test Extract User");
  const cookie = buildUserSessionCookie(token);
  const res = await fetch(`${baseUrl}/api/tor/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ file_name: "tor.txt", content_base64: Buffer.from("hi").toString("base64") })
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.text, "hi");
});

test("POST /api/tor/extract rejects unsupported extension with 400", async () => {
  const token = await createUserSession("test-uuid-extract-2", "Test Extract User");
  const cookie = buildUserSessionCookie(token);
  const res = await fetch(`${baseUrl}/api/tor/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ file_name: "evil.exe", content_base64: Buffer.from("x").toString("base64") })
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.match(body.error, /Unsupported file type/);
});
