import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { __setSupabaseAdminForTest } from "../lib/db/client.js";
import { getProjectById, listProjectsByUser } from "../lib/projects.js";
import { getConversationsByProject } from "../lib/conversations.js";

function makeStubClient(rows, capture) {
  const builder = {
    from(table) { capture.table = table; return builder; },
    select() { return builder; },
    eq(col, val) { capture.eqs.push([col, val]); return builder; },
    order() { return builder; },
    async maybeSingle() {
      const row = rows.find(r => capture.eqs.every(([c, v]) => r[c] === v));
      return { data: row ?? null, error: null };
    },
    then(onFulfilled, onRejected) {
      const filtered = rows.filter(r => capture.eqs.every(([c, v]) => r[c] === v));
      return Promise.resolve({ data: filtered, error: null }).then(onFulfilled, onRejected);
    }
  };
  return builder;
}

describe("Tenant isolation — DB layer enforces org_id filter", () => {
  let capture;

  beforeEach(() => {
    capture = { eqs: [] };
  });

  afterEach(() => {
    __setSupabaseAdminForTest(undefined);
  });

  it("getProjectById applies org_id filter when orgId provided", async () => {
    const rows = [
      { id: "p1", org_id: "orgA", customer_name: "A" },
      { id: "p1", org_id: "orgB", customer_name: "B" }
    ];
    __setSupabaseAdminForTest(makeStubClient(rows, capture));

    const result = await getProjectById("p1", "orgA");
    assert.equal(result?.org_id, "orgA");
    assert.ok(capture.eqs.some(([c, v]) => c === "org_id" && v === "orgA"), "must filter by org_id");
  });

  it("getProjectById returns null when org_id mismatches (cross-tenant access blocked)", async () => {
    const rows = [{ id: "p1", org_id: "orgA", customer_name: "A" }];
    __setSupabaseAdminForTest(makeStubClient(rows, capture));

    const result = await getProjectById("p1", "orgB");
    assert.equal(result, null, "cross-tenant access must return null");
  });

  it("getProjectById without orgId (superadmin) skips org filter", async () => {
    const rows = [{ id: "p1", org_id: "orgA" }];
    __setSupabaseAdminForTest(makeStubClient(rows, capture));

    const result = await getProjectById("p1", null);
    assert.equal(result?.id, "p1");
    assert.ok(!capture.eqs.some(([c]) => c === "org_id"), "must NOT filter by org_id when null");
  });

  it("listProjectsByUser filters by both user_id AND org_id", async () => {
    const rows = [
      { id: "p1", user_id: "u1", org_id: "orgA" },
      { id: "p2", user_id: "u1", org_id: "orgB" },
      { id: "p3", user_id: "u2", org_id: "orgA" }
    ];
    __setSupabaseAdminForTest(makeStubClient(rows, capture));

    const result = await listProjectsByUser("u1", "orgA");
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "p1");
    assert.ok(capture.eqs.some(([c, v]) => c === "user_id" && v === "u1"));
    assert.ok(capture.eqs.some(([c, v]) => c === "org_id" && v === "orgA"));
  });

  it("getConversationsByProject applies org_id filter when orgId provided", async () => {
    const rows = [
      { id: "c1", project_id: "p1", org_id: "orgA" },
      { id: "c2", project_id: "p1", org_id: "orgB" }
    ];
    __setSupabaseAdminForTest(makeStubClient(rows, capture));

    const result = await getConversationsByProject("p1", "orgA");
    assert.equal(result.length, 1);
    assert.equal(result[0].org_id, "orgA");
    assert.ok(capture.eqs.some(([c, v]) => c === "org_id" && v === "orgA"));
  });

  it("getConversationsByProject without orgId returns all (superadmin)", async () => {
    const rows = [
      { id: "c1", project_id: "p1", org_id: "orgA" },
      { id: "c2", project_id: "p1", org_id: "orgB" }
    ];
    __setSupabaseAdminForTest(makeStubClient(rows, capture));

    const result = await getConversationsByProject("p1", null);
    assert.equal(result.length, 2);
    assert.ok(!capture.eqs.some(([c]) => c === "org_id"));
  });
});
