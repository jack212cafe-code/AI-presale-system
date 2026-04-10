import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { validateGate1, extractBomGroundingWarnings } from "../../lib/validation.js";

describe("validateGate1 — Discovery → Solution gate", () => {
  const validReqs = {
    category: "HCI",
    use_cases: ["HCI"],
    scale: { vm_count: 50, storage_tb: 20 }
  };

  it("passes when all required fields are present", () => {
    const gaps = validateGate1(validReqs);
    assert.deepEqual(gaps, []);
  });

  it("flags missing category", () => {
    const gaps = validateGate1({ ...validReqs, category: undefined });
    assert.ok(gaps.some((g) => g.includes("HCI") || g.includes("ประเภทงาน")));
  });

  it("flags missing vm_count", () => {
    const gaps = validateGate1({ ...validReqs, scale: { storage_tb: 20 } });
    assert.ok(gaps.some((g) => g.includes("VM")));
  });

  it("flags missing storage_tb", () => {
    const gaps = validateGate1({ ...validReqs, scale: { vm_count: 50 } });
    assert.ok(gaps.some((g) => g.includes("storage")));
  });

  it("flags empty use_cases", () => {
    const gaps = validateGate1({ ...validReqs, use_cases: [] });
    assert.ok(gaps.some((g) => g.includes("Use case")));
  });

  it("returns multiple gaps when several fields are missing", () => {
    const gaps = validateGate1({ scale: {} });
    assert.ok(gaps.length >= 3);
  });

  it("allows vm_count = 0 without flagging (edge case)", () => {
    const gaps = validateGate1({ ...validReqs, scale: { vm_count: 0, storage_tb: 20 } });
    assert.ok(!gaps.some((g) => g.includes("VM")));
  });
});

describe("extractBomGroundingWarnings — Gate 2 BOM check", () => {
  it("returns empty array when no warnings in BOM", () => {
    const bom = {
      rows: [
        { category: "Compute", description: "Dell PowerEdge R760", qty: 2, notes: "" },
        { category: "Storage", description: "PowerStore 1200T", qty: 1, notes: "" }
      ]
    };
    assert.deepEqual(extractBomGroundingWarnings(bom), []);
  });

  it("extracts rows with GROUNDING WARNING category", () => {
    const bom = {
      rows: [
        { category: "Compute", description: "Dell PowerEdge R760", qty: 2, notes: "" },
        { category: "GROUNDING WARNING", description: "R750 — not found in KB", qty: 1, notes: "" }
      ]
    };
    const warnings = extractBomGroundingWarnings(bom);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].description, "R750 — not found in KB");
  });

  it("extracts rows with GROUNDING WARNING in notes field", () => {
    const bom = {
      rows: [
        { category: "Compute", description: "Unity XT 380", qty: 1, notes: "GROUNDING WARNING: model not in KB" }
      ]
    };
    const warnings = extractBomGroundingWarnings(bom);
    assert.equal(warnings.length, 1);
  });

  it("returns empty when bom.rows is missing", () => {
    assert.deepEqual(extractBomGroundingWarnings({}), []);
    assert.deepEqual(extractBomGroundingWarnings(null), []);
  });
});
