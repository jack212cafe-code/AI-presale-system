import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeIntakePayload } from "../lib/intake.js";
import { runSolutionAgent } from "../agents/solution.js";
import { runBomAgent } from "../agents/bom.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KNOWN_SKUS = new Set([
  "NX-HCI-BASE", "NX-HCI-STORAGE", "NX-SW-ONLY", "NX-NC2-CLOUD", "NX-DR-REPLICATION",
  "VEEAM-STD", "VEEAM-ENT", "VEEAM-ENT-PLUS", "VEEAM-M365", "VEEAM-IMMUTABLE",
  "DELL-R750XS", "DELL-3TIER", "DELL-ME5-SAN", "DELL-VXR-4N",
  "CISCO-C9300-48P", "CISCO-ASR1001", "CISCO-HX-4N", "CISCO-FPR2130",
  "FG-200F", "FG-600F", "FAZ-300G", "FMG-300G",
  "HPE-DL380-G11", "HPE-SIMPLIVITY-4N", "HPE-MSA2060"
]);

const SCENARIOS = [
  { name: "HCI", fixture: "scenario_hci.json", use_cases: ["HCI"] },
  { name: "Backup & Recovery", fixture: "scenario_backup.json", use_cases: ["Backup & Recovery"] },
  { name: "DR", fixture: "scenario_dr.json", use_cases: ["Disaster Recovery"] },
  { name: "Cybersecurity", fixture: "scenario_cybersecurity.json", use_cases: ["Cybersecurity"] },
  { name: "Full Stack", fixture: "scenario_fullstack.json", use_cases: ["HCI", "Backup & Recovery", "Disaster Recovery", "Cybersecurity"] }
];

function fmt(n) {
  return Number(n).toLocaleString("en-US");
}

function trunc(s, len) {
  return String(s).length > len ? String(s).slice(0, len - 1) + "…" : String(s);
}

let totalScenarios = 0;
let totalItems = 0;
let totalMatches = 0;

for (const scenario of SCENARIOS) {
  try {
    const fixturePath = path.join(__dirname, "..", "test", "fixtures", scenario.fixture);
    const raw = JSON.parse(await readFile(fixturePath, "utf8"));
    const intake = normalizeIntakePayload(raw);

    const requirements = {
      customer_profile: { name: intake.customer_name, industry: intake.industry, environment: null },
      use_cases: scenario.use_cases,
      scale: { users: intake.users, vm_count: intake.vm_count, storage_tb: intake.storage_tb },
      budget_range: intake.budget_range_thb,
      timeline: intake.timeline,
      constraints: [intake.notes],
      gaps: [],
      source_mode: "mock"
    };

    const solution = await runSolutionAgent(requirements);
    const bom = await runBomAgent(solution);

    const selected = solution.options[solution.selected_option ?? 0];

    console.log(`\n=== Scenario: ${scenario.name} ===\n`);
    console.log(`Solution: ${selected.name}`);
    console.log(`Architecture: ${selected.architecture}`);
    console.log(`Vendors: ${selected.vendor_stack.join(", ")}\n`);

    const rows = bom.rows || [];
    let catalogMatches = 0;

    console.log(
      "Part Number".padEnd(22) +
      "Description".padEnd(42) +
      "Qty".padStart(5) +
      "Unit Price".padStart(14) +
      "Total".padStart(14) +
      "  Catalog"
    );
    console.log("-".repeat(102));

    for (const item of rows) {
      const match = KNOWN_SKUS.has(item.part_number);
      if (match) catalogMatches++;
      const catalogLabel = match ? "✓" : "NOT IN CATALOG";
      console.log(
        String(item.part_number).padEnd(22) +
        trunc(item.description, 41).padEnd(42) +
        String(item.qty).padStart(5) +
        fmt(item.unit_price).padStart(14) +
        fmt(item.total_price).padStart(14) +
        "  " + catalogLabel
      );
    }

    console.log("-".repeat(102));
    console.log(" ".repeat(69) + fmt(bom.subtotal).padStart(14));
    console.log(`\nCatalog matches: ${catalogMatches}/${rows.length} items`);

    totalScenarios++;
    totalItems += rows.length;
    totalMatches += catalogMatches;
  } catch (err) {
    console.log(`[ERROR] Scenario ${scenario.name}: ${err.message}`);
  }
}

console.log("\n========== OVERALL SUMMARY ==========");
console.log(`Scenarios run : ${totalScenarios}/${SCENARIOS.length}`);
console.log(`Total items   : ${totalItems}`);
console.log(`Catalog match : ${totalMatches}/${totalItems}`);
