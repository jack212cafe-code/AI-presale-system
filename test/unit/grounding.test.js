import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { groundBom, findNewerVariantInKb } from "../../lib/grounding.js";

describe("findNewerVariantInKb — family-aware model upgrade", () => {
  it("upgrades DD6400 → DD6410 when same family variant exists", () => {
    assert.equal(findNewerVariantInKb("DD6400", new Set(["DD6400", "DD6410"])), "DD6410");
  });

  it("returns null when KB has only different-family DD models", () => {
    assert.equal(findNewerVariantInKb("DD6400", new Set(["DD3300", "DD9400"])), null);
  });

  it("upgrades R750 → R770 when newer R7xx exists in KB", () => {
    assert.equal(findNewerVariantInKb("R750", new Set(["R760", "R770"])), "R770");
  });

  it("returns null when no KB model is newer", () => {
    assert.equal(findNewerVariantInKb("DD6410", new Set(["DD6400", "DD6410"])), null);
  });

  it("returns null for unparseable tokens", () => {
    assert.equal(findNewerVariantInKb("FOOBAR", new Set(["DD6410"])), null);
  });
});

describe("groundBom — auto-upgrade + warning fallback", () => {
  it("auto-swaps DD6400 → DD6410 in description and adds note", () => {
    const kb = [{ title: "Dell DD6410", content: "PowerProtect DD6410 appliance." }];
    const bom = {
      rows: [{ category: "[Storage]", description: "Dell DD6400 — backup target", qty: 1, notes: "" }],
      notes: []
    };
    const result = groundBom(bom, kb);
    assert.equal(result.rows.length, 1);
    assert.match(result.rows[0].description, /DD6410/);
    assert.doesNotMatch(result.rows[0].description, /DD6400/);
    assert.match(result.rows[0].notes, /upgraded from DD6400 → DD6410/);
    assert.ok(result.notes.some((n) => n.includes("Auto-upgraded DD6400 → DD6410")));
    assert.equal(result.rows.filter((r) => r.category === "GROUNDING WARNING").length, 0);
  });

  it("emits GROUNDING WARNING when no same-family variant exists", () => {
    const kb = [{ title: "Dell DD3300", content: "DD3300 entry appliance." }];
    const bom = {
      rows: [{ category: "[Storage]", description: "Dell DD6400", qty: 1, notes: "" }],
      notes: []
    };
    const result = groundBom(bom, kb);
    const warnings = result.rows.filter((r) => r.category === "GROUNDING WARNING");
    assert.equal(warnings.length, 1);
    assert.match(warnings[0].description, /DD6400/);
    assert.match(result.rows[0].description, /DD6400/); // unchanged
  });

  it("leaves grounded model untouched", () => {
    const kb = [{ title: "Dell DD6410", content: "DD6410 is available." }];
    const bom = {
      rows: [{ category: "[Storage]", description: "Dell DD6410 — 1 unit", qty: 1, notes: "" }],
      notes: []
    };
    const result = groundBom(bom, kb);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].description, "Dell DD6410 — 1 unit");
    assert.equal(result.rows[0].notes, "");
  });

  it("skips grounding entirely when KB is empty", () => {
    const bom = { rows: [{ category: "[Storage]", description: "Anything XYZ9999", qty: 1, notes: "" }], notes: [] };
    const result = groundBom(bom, []);
    assert.deepEqual(result, bom);
  });

  it("does not flag RAM capacities in 128GB–2048GB common range", () => {
    const kb = [{ title: "Dell R770", content: "PowerEdge R770 with 3.84TB NVMe." }];
    const bom = {
      rows: [{ category: "[Compute]", description: "R770 server, 512GB RAM, 3.84TB NVMe", qty: 1, notes: "" }],
      notes: []
    };
    const result = groundBom(bom, kb);
    assert.equal(result.rows.filter((r) => r.category === "GROUNDING WARNING").length, 0);
  });

  it("does not false-positive on DDR5/RAID10 tokens in descriptions", () => {
    const kb = [{ title: "Dell R760", content: "PowerEdge R760 supports DDR5 memory and RAID10 config." }];
    const bom = {
      rows: [{ category: "[Compute]", description: "R760 with DDR5 RAM and RAID10 boot", qty: 1, notes: "" }],
      notes: []
    };
    const result = groundBom(bom, kb);
    assert.equal(result.rows.filter((r) => r.category === "GROUNDING WARNING").length, 0);
  });
});
