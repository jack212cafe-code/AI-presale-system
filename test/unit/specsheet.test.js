import { describe, it } from "node:test";
import assert from "node:assert/strict";

process.env.AI_PRESALE_FORCE_LOCAL = "1";

import { buildSpecSheetBuffer } from "../../lib/specsheet.js";

const mockProject = { customer_name: "Test Corp" };

const mockRequirements = {
  scale: { vm_count: 50, storage_tb: 20, users: 100, vm_count_3yr: 80 },
  existing_infrastructure: { switches: "Cisco 10G", rack_power_kw: 10, fiber_available: true, notes: null },
  budget_range: "5M THB",
  timeline: "Q3 2026",
  constraints: ["No VMware"],
  category: "HCI"
};

const mockSolution = {
  selected_option: 0,
  options: [{
    name: "Nutanix HCI",
    architecture: "HCI",
    vendor_stack: ["Nutanix", "Dell"],
    ha_level: "N+1",
    rpo_rto: "RPO 1h / RTO 4h",
    compliance_flags: []
  }]
};

describe("buildSpecSheetBuffer", () => {
  it("returns a Buffer", async () => {
    const buf = await buildSpecSheetBuffer({ project: mockProject, requirements: mockRequirements, solution: mockSolution });
    assert.ok(buf instanceof Buffer, "must return a Buffer");
  });

  it("buffer is non-empty", async () => {
    const buf = await buildSpecSheetBuffer({ project: mockProject, requirements: mockRequirements, solution: mockSolution });
    assert.ok(buf.length > 0, "buffer must not be empty");
  });

  it("works when customer_name is omitted (privacy mode)", async () => {
    const buf = await buildSpecSheetBuffer({
      project: { customer_name: null },
      requirements: mockRequirements,
      solution: mockSolution
    });
    assert.ok(buf instanceof Buffer);
  });
});
