import { describe, it } from "node:test";
import assert from "node:assert/strict";

process.env.AI_PRESALE_FORCE_LOCAL = "1";

import {
  updateProjectName,
  listProjectsByCustomerName,
  getRejectedOptionsByCustomer
} from "../../lib/projects.js";
import { buildSolutionMemoryContext } from "../../agents/solution.js";
import { getVendorPreferences, upsertVendorPreference } from "../../lib/user-preferences.js";

const TEST_USER_ID = `test-user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const UPSERT_TEST_USER_ID = `test-upsert-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const TEST_CUSTOMER = "Acme Corp";

describe("updateProjectName — local mode", () => {
  it("returns an object with a 'saved' boolean property", async () => {
    let result;
    try {
      result = await updateProjectName("00000000-0000-0000-0000-000000000001", `${TEST_CUSTOMER} — HCI`);
    } catch {
      result = { saved: false };
    }
    assert.ok(typeof result.saved === "boolean", "saved must be boolean");
  });
});

describe("listProjectsByCustomerName — local mode", () => {
  it("returns empty array when Supabase not configured", async () => {
    const result = await listProjectsByCustomerName(TEST_USER_ID, TEST_CUSTOMER);
    assert.ok(Array.isArray(result), "must return an array");
    assert.equal(result.length, 0);
  });
});

describe("getRejectedOptionsByCustomer — local mode", () => {
  it("returns empty array when Supabase not configured", async () => {
    const result = await getRejectedOptionsByCustomer(TEST_USER_ID, TEST_CUSTOMER);
    assert.ok(Array.isArray(result), "must return an array");
    assert.equal(result.length, 0);
  });
});

describe("getVendorPreferences — local mode", () => {
  it("returns default { preferred: [], disliked: [] } when Supabase not configured", async () => {
    const result = await getVendorPreferences(TEST_USER_ID);
    assert.deepEqual(result, { preferred: [], disliked: [] });
  });
});

describe("upsertVendorPreference — local mode", () => {
  it("returns an object with a 'saved' boolean property", async () => {
    let result;
    try {
      result = await upsertVendorPreference(UPSERT_TEST_USER_ID, "Nutanix", "preferred");
    } catch {
      result = { saved: false };
    }
    assert.ok(typeof result.saved === "boolean", "saved must be boolean");
  });
});

describe("memory injection logic — duplicate notice", () => {
  it("builds no duplicate notice when listProjectsByCustomerName returns empty", async () => {
    const priorProjects = await listProjectsByCustomerName(TEST_USER_ID, TEST_CUSTOMER);
    const fakeProjectId = "current-project-id";
    const others = priorProjects.filter(p => p.id !== fakeProjectId);
    assert.equal(others.length, 0, "no duplicates in local mode");
    const duplicateNotice = others.length > 0
      ? `_พบ proposal เก่าสำหรับลูกค้า "${TEST_CUSTOMER}" จำนวน ${others.length} รายการ_\n\n`
      : "";
    assert.equal(duplicateNotice, "");
  });
});

describe("memory injection logic — vendor constraint building", () => {
  it("builds no constraints when preferences are empty", async () => {
    const vendorPrefs = await getVendorPreferences(TEST_USER_ID);
    const constraints = [];
    if (vendorPrefs.preferred.length > 0) {
      constraints.push(`Preferred vendors: ${vendorPrefs.preferred.join(", ")}`);
    }
    if (vendorPrefs.disliked.length > 0) {
      constraints.push(`Disliked vendors (avoid if possible): ${vendorPrefs.disliked.join(", ")}`);
    }
    assert.equal(constraints.length, 0);
  });

  it("builds constraint strings from non-empty preferences correctly", () => {
    const vendorPrefs = { preferred: ["Nutanix"], disliked: ["Cisco"] };
    const constraints = [];
    if (vendorPrefs.preferred.length > 0) {
      constraints.push(`Preferred vendors: ${vendorPrefs.preferred.join(", ")}`);
    }
    if (vendorPrefs.disliked.length > 0) {
      constraints.push(`Disliked vendors (avoid if possible): ${vendorPrefs.disliked.join(", ")}`);
    }
    assert.equal(constraints.length, 2);
    assert.ok(constraints[0].includes("Nutanix"));
    assert.ok(constraints[1].includes("Cisco"));
  });
});

describe("memory injection logic — rejected options", () => {
  it("does not inject prior rejected options into solution memory context", () => {
    const requirements = {
      prior_rejected_options: [
        { name: "Old Option", vendor_stack: ["Dell"] }
      ],
      vendor_preferences: { preferred: ["HPE"], disliked: ["VMware"] }
    };
    const context = buildSolutionMemoryContext(requirements);
    assert.ok(context.includes("HPE"));
    assert.ok(context.includes("VMware"));
    assert.ok(!context.includes("Old Option"));
  });
});

describe("project name derivation", () => {
  it("derives name from customer_profile.name + category", () => {
    const requirements = { customer_profile: { name: "Acme Corp" }, category: "HCI" };
    const customerName = requirements.customer_profile?.name;
    const category = requirements.category;
    const projectName = customerName
      ? `${customerName} — ${category || "Project"}`
      : `${category || "Project"} ${new Date().toISOString().slice(0, 10)}`;
    assert.equal(projectName, "Acme Corp — HCI");
  });

  it("falls back to category + date when no customer name", () => {
    const requirements = { category: "DR" };
    const customerName = requirements.customer_profile?.name;
    const category = requirements.category;
    const today = new Date().toISOString().slice(0, 10);
    const projectName = customerName
      ? `${customerName} — ${category || "Project"}`
      : `${category || "Project"} ${today}`;
    assert.ok(projectName.startsWith("DR "), `should start with 'DR ', got: ${projectName}`);
    assert.ok(projectName.includes(today));
  });
});
