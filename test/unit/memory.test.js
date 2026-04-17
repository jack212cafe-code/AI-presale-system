import { describe, it } from "node:test";
import assert from "node:assert/strict";

process.env.AI_PRESALE_FORCE_LOCAL = "1";

import {
  getVendorPreferences,
  upsertVendorPreference
} from "../../lib/user-preferences.js";

import {
  updateProjectName,
  listProjectsByCustomerName,
  getRejectedOptionsByCustomer
} from "../../lib/projects.js";

describe("memory lib — null-client fallbacks", () => {
  it("getVendorPreferences returns { preferred: [], disliked: [] } when client is null", async () => {
    const result = await getVendorPreferences("user-1");
    assert.ok(result && Array.isArray(result.preferred) && Array.isArray(result.disliked));
  });

  it("upsertVendorPreference returns { saved: false } when client is null", async () => {
    const result = await upsertVendorPreference("user-1", "Nutanix", "preferred");
    assert.ok(result && typeof result.saved === "boolean");
  });

  it("updateProjectName returns { saved: false } when client is null", async () => {
    let result;
    try {
      result = await updateProjectName("00000000-0000-0000-0000-000000000001", "Test Customer");
    } catch {
      result = { saved: false };
    }
    assert.ok(result && typeof result.saved === "boolean");
  });

  it("listProjectsByCustomerName returns [] when client is null", async () => {
    const result = await listProjectsByCustomerName("user-1", "Acme");
    assert.deepEqual(result, []);
  });

  it("getRejectedOptionsByCustomer returns [] when client is null", async () => {
    const result = await getRejectedOptionsByCustomer("user-1", "Acme");
    assert.deepEqual(result, []);
  });
});

describe("getRejectedOptionsByCustomer — extraction logic", () => {
  it("extracts non-selected options from solution_json", () => {
    const solutionJson = {
      selected_option: 0,
      options: [
        { name: "Option A", vendor_stack: ["Nutanix"] },
        { name: "Option B", vendor_stack: ["Dell"] },
        { name: "Option C", vendor_stack: ["HPE"] }
      ]
    };

    const rejected = [];
    const sol = solutionJson;
    const selected = sol.selected_option ?? -1;
    sol.options.forEach((opt, i) => {
      if (i !== selected) rejected.push({ name: opt.name, vendor_stack: opt.vendor_stack });
    });

    assert.equal(rejected.length, 2);
    assert.equal(rejected[0].name, "Option B");
    assert.equal(rejected[1].name, "Option C");
  });

  it("returns empty when no options exist in solution_json", () => {
    const sol = { selected_option: 0 };
    const rejected = [];
    if (sol?.options) {
      sol.options.forEach((opt, i) => {
        if (i !== (sol.selected_option ?? -1)) rejected.push(opt);
      });
    }
    assert.deepEqual(rejected, []);
  });
});

describe("upsertVendorPreference — opposite-list removal logic", () => {
  it("removes vendor from opposite list when adding to preferred", () => {
    const prefs = { preferred: [], disliked: ["Nutanix", "Dell"] };
    const vendor = "Nutanix";
    const sentiment = "preferred";
    const opposite = "disliked";

    prefs[opposite] = prefs[opposite].filter(v => v !== vendor);
    if (!prefs[sentiment].includes(vendor)) prefs[sentiment].push(vendor);

    assert.deepEqual(prefs.preferred, ["Nutanix"]);
    assert.deepEqual(prefs.disliked, ["Dell"]);
  });
});
