import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.AI_PRESALE_FORCE_LOCAL = "1";
process.env.ADMIN_PORTAL_PASSWORD = "test-admin-password";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { createAppServer } = await import("../server.js");
const { createUserSession, buildUserSessionCookie } = await import("../lib/user-auth.js");

async function loadFixture(name) {
  const filePath = path.join(__dirname, "fixtures", name);
  return JSON.parse(await readFile(filePath, "utf8"));
}

let server;
let baseUrl;
let authCookie;

test.before(async () => {
  server = createAppServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;

  const token = createUserSession("test-pipeline-user", "Pipeline Tester");
  authCookie = buildUserSessionCookie(token);
});

test.after(() => {
  if (server) server.close();
});

test("POST /api/pipeline with HCI fixture returns complete project", async () => {
  const fixture = await loadFixture("scenario_hci.json");
  const res = await fetch(`${baseUrl}/api/pipeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: authCookie },
    body: JSON.stringify(fixture)
  });

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(body.project, "response must include project");
  assert.ok(body.project.id, "project must have id");
  assert.ok(body.pipeline_stages, "response must include pipeline_stages");
  assert.equal(body.pipeline_stages.discovery, "complete");
  assert.equal(body.pipeline_stages.solution, "complete");
  assert.equal(body.pipeline_stages.bom, "complete");
  assert.equal(body.pipeline_stages.proposal, "complete");
});

test("GET /api/projects/:id/status returns project record or 404 in local mode", async () => {
  const fixture = await loadFixture("scenario_hci.json");
  const createRes = await fetch(`${baseUrl}/api/intake`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: authCookie },
    body: JSON.stringify(fixture)
  });
  assert.equal(createRes.status, 201);
  const createBody = await createRes.json();
  const projectId = createBody.project.id;

  const res = await fetch(`${baseUrl}/api/projects/${projectId}/status`, {
    headers: { Cookie: authCookie }
  });
  const body = await res.json();
  // In local mode (no Supabase), getProjectById returns null -> 404
  // In integrated mode, project is found -> 200 with project.id matching
  if (res.status === 200) {
    assert.equal(body.ok, true);
    assert.equal(body.project.id, projectId);
  } else {
    assert.equal(res.status, 404);
    assert.equal(body.ok, false);
  }
});

test("POST /api/pipeline with empty payload returns error", async () => {
  const res = await fetch(`${baseUrl}/api/pipeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: authCookie },
    body: JSON.stringify({})
  });

  const body = await res.json();
  assert.equal(body.ok, false);
});

test("GET /api/projects/nonexistent-id/status returns 404 or error", async () => {
  const res = await fetch(`${baseUrl}/api/projects/00000000-0000-0000-0000-000000000000/status`, {
    headers: { Cookie: authCookie }
  });
  const body = await res.json();
  assert.ok(res.status === 404 || body.ok === false);
});
