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
  return JSON.parse(await readFile(path.join(__dirname, "fixtures", name), "utf8"));
}

let server;
let baseUrl;
let authCookie;

test.before(async () => {
  server = createAppServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const token = await createUserSession("smoke-test-user", "Smoke Tester");
  authCookie = buildUserSessionCookie(token);
});

test.after(() => { if (server) server.close(); });

const SCENARIOS = [
  { name: "HCI",    file: "scenario_hci.json" },
  { name: "Backup", file: "scenario_backup.json" },
  { name: "DR",     file: "scenario_dr.json" }
];

for (const sc of SCENARIOS) {
  test(`smoke: ${sc.name} fixture completes all 4 pipeline stages`, async () => {
    const fixture = await loadFixture(sc.file);
    const res = await fetch(`${baseUrl}/api/pipeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: authCookie },
      body: JSON.stringify(fixture)
    });

    assert.equal(res.status, 201, `${sc.name}: pipeline must return 201`);
    const body = await res.json();
    assert.equal(body.ok, true, `${sc.name}: ok must be true`);
    assert.equal(body.pipeline_stages?.discovery, "complete");
    assert.equal(body.pipeline_stages?.solution, "complete");
    assert.equal(body.pipeline_stages?.bom, "complete");
    assert.equal(body.pipeline_stages?.proposal, "complete");

    const bom = body.project?.bom_json;
    if (bom) {
      const rows = Array.isArray(bom.rows) ? bom.rows : [];
      assert.ok(rows.length > 0, `${sc.name}: BOM must have rows`);
      const hasCompute = rows.some(r => String(r.category || "").toLowerCase().includes("compute"));
      assert.ok(hasCompute, `${sc.name}: BOM must have at least one Compute row`);
    }
  });
}
