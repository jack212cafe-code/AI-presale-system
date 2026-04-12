import { describe, it } from "node:test";
import assert from "node:assert/strict";

process.env.AI_PRESALE_FORCE_LOCAL = "1";

import { runDiscoveryAgent, CATEGORY_TO_USE_CASES } from "../../agents/discovery.js";

const testIntake = {
  customer_name: "Test Corp",
  partner_type: "System Integrator",
  primary_use_case: "HCI infrastructure for 100 VMs",
  core_pain_point: "Legacy servers reaching EOL",
  desired_outcome: "Modern hyperconverged platform",
  trust_priority: "Reliability",
  notes: "Need backup solution too",
  users: 200,
  vm_count: 100,
  storage_tb: 50
};

describe("generate_questions mode", () => {
  it("returns object with non-empty question_text string", async () => {
    const result = await runDiscoveryAgent(testIntake, { mode: "generate_questions" });
    assert.ok(result, "result must exist");
    assert.ok("question_text" in result, "result must have question_text property");
    assert.equal(typeof result.question_text, "string");
    assert.ok(result.question_text.length > 0, "question_text must be non-empty");
  });

  it("returns hints as a non-empty array of strings", async () => {
    const result = await runDiscoveryAgent(testIntake, { mode: "generate_questions" });
    assert.ok("hints" in result, "result must have hints property");
    assert.ok(Array.isArray(result.hints), "hints must be an array");
    assert.ok(result.hints.length > 0, "hints must be non-empty");
    assert.ok(result.hints.every(h => typeof h === "string"), "each hint must be a string");
  });
});

describe("parse_answers mode", () => {
  it("returns object with valid category field", async () => {
    const result = await runDiscoveryAgent(testIntake, {
      mode: "parse_answers",
      discoveryReply: "50 VM, 20TB storage, budget 3M THB"
    });
    assert.ok("category" in result, "result must have category property");
    assert.ok(
      ["HCI", "DR", "Backup", "Security", "Full-stack"].includes(result.category),
      `category must be one of the valid values, got: ${result.category}`
    );
  });

  it("returns assumptions_applied as an array", async () => {
    const result = await runDiscoveryAgent(testIntake, {
      mode: "parse_answers",
      discoveryReply: "50 VM, 20TB storage, budget 3M THB"
    });
    assert.ok(Array.isArray(result.assumptions_applied), "assumptions_applied must be an array");
  });

  it("does not invent user count when the customer did not mention users", async () => {
    const result = await runDiscoveryAgent(
      {
        ...testIntake,
        users: null
      },
      {
        mode: "parse_answers",
        discoveryReply: "50 VM, 20TB storage, budget 3M THB"
      }
    );
    assert.equal(result.scale.users, null);
    assert.equal(result.explicit_fields?.users, false);
  });
});

describe("CATEGORY_TO_USE_CASES", () => {
  it("map has all 5 category keys", () => {
    assert.ok("HCI" in CATEGORY_TO_USE_CASES);
    assert.ok("DR" in CATEGORY_TO_USE_CASES);
    assert.ok("Backup" in CATEGORY_TO_USE_CASES);
    assert.ok("Security" in CATEGORY_TO_USE_CASES);
    assert.ok("Full-stack" in CATEGORY_TO_USE_CASES);
  });

  it("HCI maps to [\"HCI\"]", () => {
    assert.deepEqual(CATEGORY_TO_USE_CASES["HCI"], ["HCI"]);
  });

  it("Full-stack maps to all four use cases", () => {
    const fs = CATEGORY_TO_USE_CASES["Full-stack"];
    assert.ok(fs.includes("HCI"), "Full-stack must include HCI");
    assert.ok(fs.includes("Disaster Recovery"), "Full-stack must include Disaster Recovery");
    assert.ok(fs.includes("Backup & Recovery"), "Full-stack must include Backup & Recovery");
    assert.ok(fs.includes("Cybersecurity"), "Full-stack must include Cybersecurity");
  });
});
