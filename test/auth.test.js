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

describe("Auth endpoints", () => {
  it("POST /api/auth/login without credentials returns 401", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(res.status, 401);
  });

  it("GET /api/auth/session without cookie returns authenticated:false", async () => {
    const res = await fetch(`${baseUrl}/api/auth/session`);
    const body = await res.json();
    assert.equal(body.authenticated, false);
  });

  it("GET /api/auth/session with valid session returns authenticated:true", async () => {
    const token = createUserSession("test-uuid-1234", "Test User");
    const cookie = buildUserSessionCookie(token);
    const res = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { Cookie: cookie }
    });
    const body = await res.json();
    assert.equal(body.authenticated, true);
    assert.equal(body.user.displayName, "Test User");
  });
});

describe("Protected routes", () => {
  it("POST /api/pipeline without auth returns 401", async () => {
    const res = await fetch(`${baseUrl}/api/pipeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(res.status, 401);
  });

  it("GET /api/projects without auth returns 401", async () => {
    const res = await fetch(`${baseUrl}/api/projects`);
    assert.equal(res.status, 401);
  });

  it("GET /api/projects/:id/status without auth returns 401", async () => {
    const res = await fetch(`${baseUrl}/api/projects/some-uuid/status`);
    assert.equal(res.status, 401);
  });
});
