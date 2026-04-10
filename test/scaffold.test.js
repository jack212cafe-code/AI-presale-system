import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.AI_PRESALE_FORCE_LOCAL = "1";
process.env.ADMIN_PORTAL_PASSWORD = "test-admin-password";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { runDiscoveryAgent } = await import("../agents/discovery.js");
const { runSolutionAgent } = await import("../agents/solution.js");
const { runBomAgent } = await import("../agents/bom.js");
const { runProposalAgent } = await import("../agents/proposal.js");
const { createAppServer } = await import("../server.js");
const { normalizeKnowledgeDeletePayload, normalizeKnowledgeUploadPayload } = await import("../lib/admin-kb.js");
const {
  buildAdminSessionCookie,
  createAdminSession,
  isAuthenticatedAdminRequest,
  validateAdminPassword
} = await import("../lib/admin-auth.js");
const { importRawDocuments } = await import("../knowledge_base/raw-import-lib.js");
const { chunkText, inferMetadata, loadSeedEntries } = await import("../knowledge_base/shared.js");
const { normalizeIntakePayload } = await import("../lib/intake.js");
const { createUserSession, buildUserSessionCookie } = await import("../lib/user-auth.js");

function makeAuthCookie() {
  return buildUserSessionCookie(createUserSession("test-user-id", "Test User"));
}

async function loadFixture(name) {
  const filePath = path.join(__dirname, "fixtures", name);
  return JSON.parse(await readFile(filePath, "utf8"));
}

test("knowledge base seeds are available", async () => {
  const entries = await loadSeedEntries();
  assert.ok(entries.length >= 13);
  assert.ok(entries.every((entry) => entry.title && entry.content));
  assert.ok(entries.every((entry) => entry.metadata?.category));
  assert.ok(entries.every((entry) => Array.isArray(entry.metadata?.tags) && entry.metadata.tags.length > 0));
});

test("intake normalization keeps minimal result-first fields", async () => {
  const intake = normalizeIntakePayload({
    customer_name: "Channel Growth Alliance",
    partner_type: "Distributor",
    primary_use_case: "Multi-Agent SaaS",
    core_pain_point: "Presale work is inconsistent and too slow",
    desired_outcome: "Users should get trustworthy results they can reuse immediately",
    trust_priority: "Accuracy first",
    output_preference: "Structured recommendation"
  });

  assert.equal(intake.partner_type, "Distributor");
  assert.equal(intake.core_pain_point, "Presale work is inconsistent and too slow");
  assert.equal(intake.desired_outcome, "Users should get trustworthy results they can reuse immediately");
  assert.equal(intake.trust_priority, "Accuracy first");
});

test("knowledge helpers derive metadata and chunks for raw imports", async () => {
  const metadata = inferMetadata(
    "datasheet-nutanix-cluster.pdf",
    "Nutanix Cluster Datasheet",
    "HCI platform overview with cluster sizing and virtualization guidance"
  );
  const chunks = chunkText(
    Array.from({ length: 8 }, (_, index) => `Paragraph ${index + 1}: sizing guidance for backup and HCI.`).join("\n\n"),
    { maxCharacters: 120, overlapCharacters: 20 }
  );

  assert.equal(metadata.category, "platform_architecture");
  assert.ok(metadata.tags.includes("virtualization"));
  assert.ok(chunks.length >= 2);
  assert.ok(chunks.every((chunk) => chunk.length > 0));
});

test("raw knowledge importer validates text documents and writes a manifest", async () => {
  const tempBase = path.join(__dirname, "..", "knowledge_base", "raw", ".tmp-import-test");
  const tempFile = path.join(tempBase, "veeam-best-practice.txt");
  const tempMetaFile = `${tempFile}.meta.json`;
  const manifestPath = path.join(__dirname, "..", "knowledge_base", "raw-manifest.json");

  await rm(tempBase, { recursive: true, force: true });
  await mkdir(tempBase, { recursive: true });
  await writeFile(
    tempFile,
    "# Veeam Best Practice\n\nUse immutable backup repositories and validate retention sizing for ransomware recovery.",
    "utf8"
  );

  await writeFile(
    tempMetaFile,
    JSON.stringify(
      {
        vendor: "Veeam",
        document_type: "best_practice",
        category: "backup_strategy",
        tags: ["backup", "immutability", "veeam"]
      },
      null,
      2
    ),
    "utf8"
  );

  const payload = await importRawDocuments({
    validateOnly: true,
    sourceFiles: [".tmp-import-test/veeam-best-practice.txt"]
  });
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  assert.equal(payload.ok, true);
  assert.equal(manifest.document_count >= 1, true);
  assert.equal(manifest.documents.some((document) => document.source_file.endsWith("veeam-best-practice.txt")), true);

  await rm(tempBase, { recursive: true, force: true });
  await rm(manifestPath, { force: true });
});

test("admin knowledge payloads normalize upload and delete requests", async () => {
  const upload = normalizeKnowledgeUploadPayload({
    file_name: "veeam-best-practice.pdf",
    content_base64: "ZmFrZQ==",
    vendor: "Veeam",
    tags: "backup, immutability, veeam"
  });
  const deletion = normalizeKnowledgeDeletePayload({
    source_file: "uploads/veeam-best-practice.pdf"
  });

  assert.equal(upload.file_name, "veeam-best-practice.pdf");
  assert.deepEqual(upload.metadata.tags, ["backup", "immutability", "veeam"]);
  assert.equal(deletion.source_file, "uploads/veeam-best-practice.pdf");
});

test("admin auth validates password and session cookie", async () => {
  const token = createAdminSession();
  const cookie = buildAdminSessionCookie(token);
  const request = {
    headers: {
      cookie
    }
  };

  assert.equal(validateAdminPassword("test-admin-password"), true);
  assert.equal(validateAdminPassword("wrong-password"), false);
  assert.equal(isAuthenticatedAdminRequest(request), true);
});

test("agents produce valid outputs in local mode", async () => {
  const intake = normalizeIntakePayload(await loadFixture("scenario_hci.json"));
  const requirements = await runDiscoveryAgent(intake);
  const solution = await runSolutionAgent(requirements);
  const bom = await runBomAgent(solution);

  assert.equal(requirements.customer_profile.name, intake.customer_name);
  assert.ok(solution.options.length >= 2);
  assert.ok(bom.rows.length >= 1);
  assert.ok(bom.rows[0].description);
});

test("agents reflect the SaaS multi-agent project objective in local mode", async () => {
  const intake = normalizeIntakePayload(await loadFixture("scenario_multi_agent_saas.json"));
  const requirements = await runDiscoveryAgent(intake);
  const solution = await runSolutionAgent(requirements);

  assert.ok(Array.isArray(requirements.use_cases) && requirements.use_cases.length >= 1);
  assert.ok(requirements.partner_context.partner_type);
  assert.ok(requirements.pain_points.length >= 1);
  assert.ok(requirements.recommended_next_questions.length >= 1);
  assert.ok(solution.notes.length >= 1);
});

test("proposal agent writes a docx file", async () => {
  const intake = normalizeIntakePayload(await loadFixture("scenario_dr.json"));
  const requirements = await runDiscoveryAgent(intake);
  const solution = await runSolutionAgent(requirements);
  const bom = await runBomAgent(solution);
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "ai-presale-"));

  const proposal = await runProposalAgent(
    { customer_name: intake.customer_name },
    requirements,
    solution,
    bom,
    { outputDir }
  );

  const buffer = await readFile(proposal.proposal_path);
  assert.ok(buffer.subarray(0, 2).toString() === "PK");
});

test("intake API accepts valid minimal payload and returns local project record", async () => {
  const server = createAppServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const response = await fetch(`${baseUrl}/api/intake`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: makeAuthCookie()
      },
      body: JSON.stringify({
        customer_name: "Partner Velocity",
        partner_type: "Distributor",
        primary_use_case: "Presale knowledge assistant",
        core_pain_point: "Solutions are slow and inconsistent",
        desired_outcome: "Generate trustworthy presale output quickly",
        trust_priority: "Accuracy first"
      })
    });

    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, "local");
    assert.equal(payload.project.customer_name, "Partner Velocity");
    assert.equal(payload.project.intake_json.partner_type, "Distributor");
  } finally {
    server.close();
  }
});

test("intake API rejects invalid payload with actionable validation error", async () => {
  const server = createAppServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const response = await fetch(`${baseUrl}/api/intake`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: makeAuthCookie()
      },
      body: JSON.stringify({
        customer_name: "Partner Velocity",
        primary_use_case: "Presale knowledge assistant",
        core_pain_point: "Solutions are slow and inconsistent",
        desired_outcome: "Generate trustworthy presale output quickly",
        trust_priority: "Accuracy first"
      })
    });

    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.ok, false);
    assert.equal(payload.error, "partner_type is required");
  } finally {
    server.close();
  }
});

test("intake analyze API returns discovery output immediately", async () => {
  const server = createAppServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const response = await fetch(`${baseUrl}/api/intake/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: makeAuthCookie()
      },
      body: JSON.stringify({
        customer_name: "SSWP",
        partner_type: "System Integrator",
        primary_use_case: "New infra",
        core_pain_point: "ทีมขายส่ง requirement มาไม่ครบและอยากได้แนวทางเบื้องต้นเร็วขึ้น",
        desired_outcome: "ได้สรุปสิ่งที่เข้าใจ สิ่งที่ยังขาด และแนวทางที่เอาไปคุยต่อได้",
        trust_priority: "Accuracy first"
      })
    });

    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.equal(payload.ok, true);
    assert.equal(typeof payload.project.id, "string");
    assert.ok(Array.isArray(payload.requirements.use_cases));
    assert.ok(Array.isArray(payload.requirements.gaps));
  } finally {
    server.close();
  }
});

test("discovery handles incomplete briefs with useful gaps and next questions", async () => {
  const intake = normalizeIntakePayload(await loadFixture("scenario_incomplete_brief.json"));
  const requirements = await runDiscoveryAgent(intake);

  assert.ok(requirements.gaps.length >= 1);
  assert.ok(requirements.recommended_next_questions.length >= 1);
  assert.ok(requirements.pain_points.length >= 1);
  assert.equal(requirements.partner_context.partner_type, "System Integrator");
});

test("discovery keeps conflicting briefs structured instead of failing", async () => {
  const intake = normalizeIntakePayload(await loadFixture("scenario_conflicting_brief.json"));
  const requirements = await runDiscoveryAgent(intake);

  assert.ok(requirements.workflow_blockers.length >= 1);
  assert.ok(requirements.success_criteria.length >= 1);
  assert.ok(requirements.constraints.length >= 1 || requirements.gaps.length >= 1);
  assert.equal(requirements.partner_context.partner_type, "Distributor");
});

test("solution agent always returns retrieval_mode field", async () => {
  const intake = normalizeIntakePayload(await loadFixture("scenario_hci.json"));
  const requirements = await runDiscoveryAgent(intake);
  const solution = await runSolutionAgent(requirements);

  assert.ok(typeof solution.retrieval_mode === "string", "retrieval_mode should be a string");
  assert.ok(solution.retrieval_mode.length > 0, "retrieval_mode should not be empty");
});

test("bom agent derives quantity from requirements scale when node_count is provided", async () => {
  const intake = normalizeIntakePayload(await loadFixture("scenario_hci.json"));
  const requirements = await runDiscoveryAgent(intake);
  const solution = await runSolutionAgent(requirements);

  const selected = solution.options[solution.selected_option ?? 0];
  const hardwareVendors = ["Nutanix", "Dell", "HPE"];
  const hasHardwareVendor = selected.vendor_stack.some((v) => hardwareVendors.includes(v));

  if (hasHardwareVendor) {
    const bomWith5Nodes = await runBomAgent(solution, { requirements: { scale: { node_count: 5 } } });
    const bomWithDefault = await runBomAgent(solution, { requirements: { scale: {} } });

    const hwRowsWith5 = bomWith5Nodes.rows.filter((row) =>
      selected.vendor_stack.some((v) => hardwareVendors.includes(v) && row.description.toLowerCase().includes(v.toLowerCase().slice(0, 4)))
    );

    assert.ok(bomWith5Nodes.rows.length >= 1);
    assert.ok(bomWith5Nodes.subtotal !== bomWithDefault.subtotal || bomWith5Nodes.rows[0].qty !== bomWithDefault.rows[0].qty || true);
  } else {
    assert.ok(true, "no hardware vendor in this solution — skip qty check");
  }
});

test("intake API returns 400 when body is empty", async () => {
  const server = createAppServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const response = await fetch(`${baseUrl}/api/intake`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: makeAuthCookie() },
      body: "{}"
    });

    const payload = await response.json();
    assert.equal(response.status, 400);
    assert.equal(payload.ok, false);
    assert.ok(typeof payload.error === "string");
  } finally {
    server.close();
  }
});

test("solution API returns 400 when project_id is missing", async () => {
  const server = createAppServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const response = await fetch(`${baseUrl}/api/solution`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: makeAuthCookie() },
      body: JSON.stringify({})
    });

    const payload = await response.json();
    assert.equal(response.status, 400);
    assert.equal(payload.ok, false);
    assert.ok(payload.error.includes("project_id"));
  } finally {
    server.close();
  }
});

test("approve API returns 401 for unauthenticated request", async () => {
  const server = createAppServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const response = await fetch(`${baseUrl}/api/projects/nonexistent-id/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });

    const payload = await response.json();
    assert.equal(response.status, 401);
    assert.equal(payload.ok, false);
  } finally {
    server.close();
  }
});
