import "dotenv/config";
import { config } from "./lib/config.js";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeKnowledgeDeletePayload, normalizeKnowledgeUploadPayload } from "./lib/admin-kb.js";
import {
  LOCAL_USERS,
  buildUserSessionCookie,
  buildExpiredUserSessionCookie,
  createUserSession,
  destroyUserSession,
  ensureUsersSeeded,
  getSessionRole,
  getSessionUser,
  getSessionUserId,
  getUserSessionToken,
  isAuthenticatedUserRequest,
  loadPersistedSessions,
  validateUserCredentials
} from "./lib/user-auth.js";
import { createJob, getJob, updateJob } from "./lib/admin-jobs.js";
import { normalizeIntakePayload } from "./lib/intake.js";
import {
  createProjectRecord,
  getProjectById,
  listProjectsByUser,
  persistRequirementsJson,
  persistSolutionJson,
  persistSpecialistBriefs,
  persistBomJson,
  approveProject,
  recordProjectFeedback,
  getAdminFeedbackSummary
} from "./lib/projects.js";
import { orgUserManager } from "./lib/org-user-manager.js";
import { runDiscoveryAgent } from "./agents/discovery.js";
import { runSolutionAgent } from "./agents/solution.js";
import { runAllSpecialists } from "./agents/specialist.js";
import { runBomAgent } from "./agents/bom.js";
import { runProposalAgent } from "./agents/proposal.js";
import { checkBudgetOverrun } from "./lib/budget.js";
import { handleChatMessage } from "./lib/chat.js";
import { runTorPipeline } from "./agents/tor.js";
import { generateTorComplianceCsv, getTorExportFilename } from "./lib/tor-export.js";
import { getMessagesByConversation, getConversationsByProject } from "./lib/conversations.js";
import { deleteKnowledgeDocumentBySourceFile, getSupabaseAdmin, listKnowledgeDocuments, readAgentLogs } from "./lib/supabase.js";
import { PdfExportEngine } from './lib/pdf-export.js';
import { FinancialAnalystAgent } from "./lib/bom-export.js";
import { buildSolutionBuffer } from "./lib/solution-export.js";
const pdfEngine = new PdfExportEngine();
const bomExcelAgent = new FinancialAnalystAgent();

import { deleteRawDocumentFiles, importRawDocuments, saveUploadedRawDocument } from "./knowledge_base/raw-import-lib.js";
import { upsertVendorPreference } from "./lib/user-preferences.js";
import { checkKbCoverage } from "./scripts/check-kb-coverage.js";
import { saveCorrection, listCorrections, aggregateCorrectionsToKb } from "./lib/corrections.js";
import { requireRateLimit } from "./lib/rate-limit.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isMainModule = process.argv[1] === __filename;

// In-memory TOR report cache (keyed by tor_id, TTL 24h)
const torReports = new Map();
const TOR_REPORT_TTL_MS = 24 * 60 * 60 * 1000;
setInterval(() => {
  const cutoff = Date.now() - TOR_REPORT_TTL_MS;
  for (const [id, entry] of torReports) {
    if (entry.ts < cutoff) torReports.delete(id);
  }
}, 60 * 60 * 1000).unref();

function json(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders
  });
  response.end(JSON.stringify(payload));
}

async function serveFile(response, filePath, contentType) {
  try {
    const file = await readFile(filePath);
    response.writeHead(200, { "Content-Type": contentType });
    response.end(file);
  } catch (error) {
    json(response, 404, { error: "Not found", detail: error.message });
  }
}

async function parseBody(request) {
  const MAX_BODY_BYTES = 20 * 1024 * 1024; // Increase to 20MB to support KB imports
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) {
      request.destroy();
      const err = new Error("Request body too large");
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}


function requireUserAuth(request, response) {
  if (!isAuthenticatedUserRequest(request)) {
    json(response, 401, { ok: false, error: "Authentication required" });
    return false;
  }
  return true;
}

function requireRole(request, response, roles) {
  if (!isAuthenticatedUserRequest(request)) {
    json(response, 401, { ok: false, error: "Authentication required" });
    return false;
  }
  const role = getSessionRole(request);
  if (!roles.includes(role)) {
    json(response, 403, { ok: false, error: "Insufficient permissions" });
    return false;
  }
  return true;
}

function startKnowledgeImportJob(jobId, sourceFile) {
  importRawDocuments({
    sourceFiles: [sourceFile],
    onProgress: (patch) => updateJob(jobId, patch)
  })
    .then((result) => {
      updateJob(jobId, {
        status: "completed",
        stage: "completed",
        progress_percent: 100,
        message: "Import completed",
        result
      });
    })
    .catch((error) => {
      updateJob(jobId, {
        status: "failed",
        stage: "failed",
        progress_percent: 100,
        message: error.message,
        error: error.message
      });
    });
}

export async function appHandler(request, response) {
  const url = new URL(request.url ?? "/", config.publicBaseUrl);
  console.log(`[req] ${request.method} ${url.pathname}`);

  if (request.method === "GET" && url.pathname === "/health") {
    const PROBE_TIMEOUT_MS = 3000;
    const probeTimeout = (promise) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), PROBE_TIMEOUT_MS))
    ]);

    const checks = {};
    const supabase = getSupabaseAdmin();
    if (supabase) {
      checks.supabase = await probeTimeout(
        supabase.from("sessions").select("token").limit(1).then(({ error }) => error ? { ok: false, error: error.message } : { ok: true })
      ).catch(err => ({ ok: false, error: err.message }));
    } else {
      checks.supabase = { ok: true, note: "local mode" };
    }

    if (config.openai.apiKey) {
      checks.openai = await probeTimeout(
        fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${config.openai.apiKey}` }
        }).then(r => r.ok ? { ok: true } : { ok: false, error: `HTTP ${r.status}` })
      ).catch(err => ({ ok: false, error: err.message }));
    } else {
      checks.openai = { ok: false, error: "no API key" };
    }

    const allOk = Object.values(checks).every(c => c.ok);
    return json(response, allOk ? 200 : 503, {
      status: allOk ? "ok" : "degraded",
      mode: supabase ? "integrated" : "local",
      checks,
      timestamp: new Date().toISOString()
    });
  }

  if (request.method === "GET" && url.pathname === "/") {
    return serveFile(response, path.join(__dirname, "login", "login.html"), "text/html; charset=utf-8");
  }

  if (request.method === "GET" && url.pathname === "/admin") {
    return serveFile(response, path.join(__dirname, "admin", "index.html"), "text/html; charset=utf-8");
  }

  if (request.method === "GET" && url.pathname === "/intake/submit.js") {
    return serveFile(
      response,
      path.join(__dirname, "intake", "submit.js"),
      "application/javascript; charset=utf-8"
    );
  }

  if (request.method === "GET" && url.pathname === "/admin/admin.js") {
    return serveFile(
      response,
      path.join(__dirname, "admin", "admin.js"),
      "application/javascript; charset=utf-8"
    );
  }

  if (request.method === "GET" && url.pathname === "/chat") {
    return serveFile(response, path.join(__dirname, "chat", "chat.html"), "text/html; charset=utf-8");
  }

  if (request.method === "GET" && url.pathname === "/login") {
    return serveFile(response, path.join(__dirname, "login", "login.html"), "text/html; charset=utf-8");
  }

  if (request.method === "GET" && url.pathname === "/chat/chat.js") {
    return serveFile(response, path.join(__dirname, "chat", "chat.js"), "application/javascript; charset=utf-8");
  }

  if (request.method === "GET" && url.pathname === "/login/login.js") {
    return serveFile(response, path.join(__dirname, "login", "login.js"), "application/javascript; charset=utf-8");
  }

  if (request.method === "POST" && url.pathname === "/api/intake") {
    if (!requireUserAuth(request, response)) return;
    try {
      const rawPayload = await parseBody(request);
      const intake = normalizeIntakePayload(rawPayload);
      const userId = getSessionUserId(request);
      const result = await createProjectRecord(intake, userId);

      return json(response, 201, {
        ok: true,
        mode: result.saved ? "integrated" : "local",
        project: result.project,
        warnings: result.warnings
      });
    } catch (error) {
      return json(response, 400, { ok: false, error: error.message });
    }
  }

  if (request.method === "POST" && url.pathname === "/api/intake/analyze") {
    if (!requireUserAuth(request, response)) return;
    if (!requireRateLimit(request, response, getSessionUserId(request), "pipeline")) return;
    try {
      const rawPayload = await parseBody(request);
      const intake = normalizeIntakePayload(rawPayload);
      const userId = getSessionUserId(request);
      const created = await createProjectRecord(intake, userId);
      const requirements = await runDiscoveryAgent(intake, {
        projectId: created.project.id
      });

      const persisted = await persistRequirementsJson(created.project.id, requirements);

      return json(response, 201, {
        ok: true,
        mode: created.saved ? "integrated" : "local",
        project: persisted.project ?? created.project,
        requirements,
        warnings: created.warnings
      });
    } catch (error) {
      return json(response, 400, { ok: false, error: error.message });
    }
  }

  if (request.method === "POST" && url.pathname === "/api/solution") {
    if (!requireUserAuth(request, response)) return;
    if (!requireRateLimit(request, response, getSessionUserId(request), "pipeline")) return;
    try {
      const rawPayload = await parseBody(request);
      if (!rawPayload.project_id) {
        return json(response, 400, { ok: false, error: "project_id is required" });
      }

      const project = await getProjectById(rawPayload.project_id);
      if (!project) {
        return json(response, 404, { ok: false, error: "Project not found" });
      }
      if (!project.requirements_json) {
        return json(response, 400, { ok: false, error: "Discovery must be completed before solution design" });
      }

      const solution = await runSolutionAgent(project.requirements_json, { projectId: project.id });
      return json(response, 200, { ok: true, project_id: project.id, solution });
    } catch (error) {
      return json(response, 400, { ok: false, error: error.message });
    }
  }

  if (request.method === "POST" && url.pathname.match(/^\/api\/projects\/[^/]+\/approve$/)) {
    if (!requireRole(request, response, ["admin", "manager"])) return;
    const projectId = url.pathname.split("/")[3];
    try {
      const project = await getProjectById(projectId);
      if (!project) {
        return json(response, 404, { ok: false, error: "Project not found" });
      }

      await approveProject(projectId);
      return json(response, 200, { ok: true, project_id: projectId, human_approved: true });
    } catch (error) {
      return json(response, 400, { ok: false, error: error.message });
    }
  }

  // POST /api/projects/:id/corrections — save a human correction
  if (request.method === "POST" && url.pathname.match(/^\/api\/projects\/[^/]+\/corrections$/)) {
    if (!requireRole(request, response, ["admin"])) return;
    const rawId = url.pathname.split("/")[3];
    const projectId = rawId === "general" ? null : rawId;
    try {
      const body = await parseBody(request);
      const { field, wrong_value, correct_value, note } = body ?? {};
      if (!field || !wrong_value || !correct_value) {
        return json(response, 400, { ok: false, error: "field, wrong_value, correct_value are required" });
      }
      await saveCorrection({ projectId, field, wrongValue: wrong_value, correctValue: correct_value, note });
      return json(response, 200, { ok: true });
    } catch (error) {
      return json(response, 500, { ok: false, error: error.message });
    }
  }

  // GET /api/admin/audit — agent logs for audit trail
  if (request.method === "GET" && url.pathname === "/api/admin/audit") {
    if (!requireRole(request, response, ["admin"])) return;
    try {
      const logs = await readAgentLogs(200);
      return json(response, 200, { ok: true, logs });
    } catch (error) {
      return json(response, 500, { ok: false, error: error.message });
    }
  }

  // GET /api/admin/corrections — list recent corrections
  if (request.method === "GET" && url.pathname === "/api/admin/corrections") {
    if (!requireRole(request, response, ["admin"])) return;
    try {
      const corrections = await listCorrections({ limit: 100 });
      return json(response, 200, { ok: true, corrections });
    } catch (error) {
      return json(response, 500, { ok: false, error: error.message });
    }
  }

  // POST /api/admin/corrections/aggregate — push corrections into KB
  if (request.method === "POST" && url.pathname === "/api/admin/corrections/aggregate") {
    if (!requireRole(request, response, ["admin"])) return;
    try {
      const result = await aggregateCorrectionsToKb();
      return json(response, 200, { ok: true, kb_entries_upserted: result.count });
    } catch (error) {
      return json(response, 500, { ok: false, error: error.message });
    }
  }

  if (request.method === "GET" && url.pathname === "/api/admin/kb/documents") {
    if (!requireRole(request, response, ["admin"])) {
      return;
    }

    try {
      const documents = await listKnowledgeDocuments();
      return json(response, 200, { ok: true, documents });
    } catch (error) {
      return json(response, 500, { ok: false, error: error.message });
    }
  }

  if (request.method === "GET" && url.pathname === "/api/admin/session") {
    const role = getSessionRole(request);
    const authenticated = isAuthenticatedUserRequest(request) && role === "admin";
    return json(response, 200, { ok: true, configured: true, authenticated, role: role ?? null });
  }

  if (request.method === "POST" && url.pathname === "/api/admin/login") {
    try {
      const payload = await parseBody(request);
      const user = await validateUserCredentials(payload.username || "", payload.password || "");
      if (!user || user.role !== "admin") {
        return json(response, 401, { ok: false, error: "Invalid credentials or insufficient role" });
      }
      const token = createUserSession(user.id, user.display_name, user.role);
      return json(
        response,
        200,
        { ok: true, authenticated: true, role: user.role },
        { "Set-Cookie": buildUserSessionCookie(token) }
      );
    } catch (error) {
      return json(response, 400, { ok: false, error: error.message });
    }
  }

  if (request.method === "POST" && url.pathname === "/api/admin/logout") {
    const token = getUserSessionToken(request);
    if (token) destroyUserSession(token);
    return json(
      response,
      200,
      { ok: true, authenticated: false },
      { "Set-Cookie": buildExpiredUserSessionCookie() }
    );
  }

  if (request.method === "POST" && url.pathname === "/api/admin/kb/upload") {
    if (!requireRole(request, response, ["admin"])) {
      return;
    }

    try {
      const payload = await parseBody(request);
      console.log(`[kb-upload] Starting upload for file: ${payload.file_name}`);
      const savedFile = await saveUploadedRawDocument({
        fileName: payload.file_name,
        contentBase64: payload.content_base64,
        metadata: payload.metadata
      });
      console.log(`[kb-upload] File saved to: ${savedFile.relativePath}`);
      const jobId = createJob({
        status: "queued",
        stage: "queued",
        progress_percent: 0,
        message: `Queued import for ${savedFile.relativePath}`,
        source_file: savedFile.relativePath
      });
      console.log(`[kb-upload] Job created: ${jobId}`);
      startKnowledgeImportJob(jobId, savedFile.relativePath);


      return json(response, 202, {
        ok: true,
        message: "Document upload accepted",
        source_file: savedFile.relativePath,
        job_id: jobId
      });
    } catch (error) {
      return json(response, 400, { ok: false, error: error.message });
    }
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/admin/kb/jobs/")) {
    if (!requireRole(request, response, ["admin"])) {
      return;
    }

    const jobId = url.pathname.slice("/api/admin/kb/jobs/".length);
    const job = getJob(jobId);
    if (!job) {
      return json(response, 404, { ok: false, error: "Job not found" });
    }

    return json(response, 200, { ok: true, job });
  }

  if (request.method === "DELETE" && url.pathname === "/api/admin/kb/documents") {
    if (!requireRole(request, response, ["admin"])) {
      return;
    }

    try {
      const payload = normalizeKnowledgeDeletePayload(await parseBody(request));
      const result = await deleteKnowledgeDocumentBySourceFile(payload.source_file);
      await deleteRawDocumentFiles(payload.source_file);

      return json(response, 200, {
        ok: true,
        deleted_chunks: result.deleted,
        source_file: payload.source_file
      });
    } catch (error) {
      return json(response, 400, { ok: false, error: error.message });
    }
  }

  if (request.method === "POST" && url.pathname === "/api/pipeline") {
    if (!requireUserAuth(request, response)) return;
    if (!requireRateLimit(request, response, getSessionUserId(request), "pipeline")) return;
    let projectId = null;
    let project = null;
    let stageFailed = null;

    try {
      const rawPayload = await parseBody(request);
      const intake = normalizeIntakePayload(rawPayload);
      const userId = getSessionUserId(request);

      // Stage 1: Create project
      const created = await createProjectRecord(intake, userId);
      project = created.project;
      projectId = project.id;

      // Stage 2: Discovery
      stageFailed = "discovery";
      const requirements = await runDiscoveryAgent(intake, { projectId });
      const discoveryResult = await persistRequirementsJson(projectId, requirements);
      project = discoveryResult.project ?? project;

      // Stage 3: Specialists + Solution
      stageFailed = "solution";
      const specialistBriefs = await runAllSpecialists(requirements, { projectId });
      await persistSpecialistBriefs(projectId, specialistBriefs);
      const solution = await runSolutionAgent(requirements, { projectId, specialistBriefs });
      await persistSolutionJson(projectId, solution);

      // Stage 4: BOM
      stageFailed = "bom";
      const bom = await runBomAgent(solution, { projectId, specialistBriefs, requirements });
      await persistBomJson(projectId, bom);

      // Budget overrun check before proposal
      const selectedOpt = solution.options?.[solution.selected_option ?? 0];
      const budgetWarning = checkBudgetOverrun(selectedOpt?.estimated_tco_thb, requirements.budget_range);

      // Auto-approve before proposal (per D-03: gate disabled for team self-review)
      await approveProject(projectId);

      // Stage 5: Proposal
      stageFailed = "proposal";
      const proposalResult = await runProposalAgent(intake, requirements, solution, bom, { projectId, budgetWarning });

      // Reload final project record
      const finalProject = await getProjectById(projectId);

      return json(response, 201, {
        ok: true,
        project: finalProject ?? project,
        pipeline_stages: {
          discovery: "complete",
          solution: "complete",
          bom: "complete",
          proposal: "complete"
        }
      });
    } catch (error) {
      // Per D-04: Save partial + return error
      const partialProject = projectId ? await getProjectById(projectId).catch(() => project) : project;
      return json(response, 500, {
        ok: false,
        stage_failed: stageFailed,
        error: error.message,
        project: partialProject
      });
    }
  }

  if (request.method === "GET" && url.pathname === "/api/projects") {
    if (!requireUserAuth(request, response)) return;
    try {
      const userId = getSessionUserId(request);
      const projects = await listProjectsByUser(userId);
      return json(response, 200, { ok: true, projects });
    } catch (error) {
      return json(response, 500, { ok: false, error: error.message });
    }
  }

  if (request.method === "GET" && url.pathname.match(/^\/api\/projects\/[^/]+\/status$/)) {
    if (!requireUserAuth(request, response)) return;
    const projectId = url.pathname.split("/")[3];
    try {
      const project = await getProjectById(projectId);
      if (!project) {
        return json(response, 404, { ok: false, error: "Project not found" });
      }
      return json(response, 200, { ok: true, project });
    } catch (error) {
      return json(response, 500, { ok: false, error: error.message });
    }
  }

  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    try {
      const payload = await parseBody(request);
      const user = await validateUserCredentials(payload.username || "", payload.password || "");
      if (!user) {
        return json(response, 401, { ok: false, error: "Invalid credentials" });
      }

      const token = createUserSession(user.id, user.display_name);
      return json(
        response,
        200,
        { ok: true, user: { id: user.id, username: user.username, display_name: user.display_name } },
        { "Set-Cookie": buildUserSessionCookie(token) }
      );
    } catch (error) {
      return json(response, 400, { ok: false, error: error.message });
    }
  }

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = getUserSessionToken(request);
    if (token) {
      destroyUserSession(token);
    }

    return json(
      response,
      200,
      { ok: true },
      { "Set-Cookie": buildExpiredUserSessionCookie() }
    );
  }

  if (request.method === "GET" && url.pathname === "/api/auth/session") {
    const user = getSessionUser(request);
    if (!user) {
      return json(response, 200, { ok: true, authenticated: false });
    }

    return json(response, 200, { ok: true, authenticated: true, user });
  }

  if (request.method === "POST" && url.pathname === "/api/chat") {
    if (!requireUserAuth(request, response)) return;
    const chatUserId = getSessionUserId(request);
    if (!requireRateLimit(request, response, chatUserId, "pipeline")) return;
    try {
      const payload = await parseBody(request);
      if (!payload.message || typeof payload.message !== "string" || !payload.message.trim()) {
        return json(response, 400, { ok: false, error: "message is required" });
      }
      const userId = chatUserId;

      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
      });

      const sendEvent = (data) => {
        response.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      let lastProgressAt = Date.now();
      const onProgress = (step, total, label) => {
        lastProgressAt = Date.now();
        sendEvent({ type: "progress", step, total, label });
      };

      // Heartbeat every 20s to prevent Render idle-connection timeout
      const heartbeat = setInterval(() => {
        if (Date.now() - lastProgressAt > 15000) {
          response.write(": heartbeat\n\n");
        }
      }, 20000);

      let result;
      try {
        result = await handleChatMessage({
          conversationId: payload.conversation_id || null,
          message: payload.message,
          userId,
          onProgress
        });
      } catch (chatError) {
        console.error("[chat] pipeline error:", chatError);
        sendEvent({ type: "done", ok: false, error: chatError.message });
        response.end();
        clearInterval(heartbeat);
        return;
      }
      clearInterval(heartbeat);

      if (result.ok === false || result.stage === "error") {
        sendEvent({ type: "done", ok: false, error: result.text, conversation_id: result.conversation_id, project_id: result.project_id, stage: result.stage });
      } else {
        sendEvent({ type: "done", ok: true, conversation_id: result.conversation_id, project_id: result.project_id, stage: result.stage, text: result.text, created: result.created, grounding_warnings: result.grounding_warnings ?? 0 });
      }
      response.end();
    } catch (error) {
      console.error("[chat] unexpected error:", error);
      try { response.write(`data: ${JSON.stringify({ type: "done", ok: false, error: error.message })}\n\n`); response.end(); } catch {}
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/tor") {
    if (!requireUserAuth(request, response)) return;
    if (!requireRateLimit(request, response, getSessionUserId(request), "pipeline")) return;
    try {
      const payload = await parseBody(request);
      if (!payload.tor_text?.trim()) return json(response, 400, { ok: false, error: "tor_text is required" });

      response.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no" });
      const sendEvent = (data) => response.write(`data: ${JSON.stringify(data)}\n\n`);

      const report = await runTorPipeline(payload.tor_text, {
        onProgress: (step, total, label) => sendEvent({ type: "progress", step, total, label })
      });

      // Store report in memory keyed by tor_id for export
      torReports.set(report.tor_id, { report, ts: Date.now() });
      sendEvent({ type: "done", ok: true, report });
      response.end();
    } catch (error) {
      try { response.write(`data: ${JSON.stringify({ type: "done", ok: false, error: error.message })}\n\n`); response.end(); } catch {}
    }
    return;
  }

  if (request.method === "GET" && url.pathname.match(/^\/api\/tor\/[^/]+\/export$/)) {
    if (!requireUserAuth(request, response)) return;
    const torId = url.pathname.split("/")[3];
    const entry = torReports.get(torId);
    if (!entry) return json(response, 404, { ok: false, error: "TOR report not found or expired" });
    const report = entry.report;
    const csv = generateTorComplianceCsv(report);
    const filename = getTorExportFilename(report.project_name);
    response.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` });
    response.end(csv);
  }

  if (request.method === "GET" && url.pathname.match(/^\/api\/proposals\/[^/]+\/download$/)) {
    if (!requireUserAuth(request, response)) return;
    const projectId = url.pathname.split("/")[3];
    try {
      const project = await getProjectById(projectId);
      if (!project || !project.proposal_url) {
        return json(response, 404, { ok: false, error: "Proposal not found" });
      }
      // Path sanitization: avoid leaking absolute path in logs or errors by keeping it local
      const filePath = path.resolve(__dirname, project.proposal_url);
      const file = await readFile(filePath);
      const filename = path.basename(filePath);
      response.writeHead(200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`
      });
      response.end(file);
    } catch (error) {
      return json(response, 500, { ok: false, error: error.message });
    }
  }

  if (request.method === "GET" && url.pathname.match(/^\/api\/conversations\/[^/]+\/messages$/)) {
    if (!requireUserAuth(request, response)) return;
    const conversationId = url.pathname.split("/")[3];
    try {
      const messages = await getMessagesByConversation(conversationId);
      return json(response, 200, { ok: true, messages });
    } catch (error) {
      return json(response, 500, { ok: false, error: error.message });
    }
  }

  if (request.method === "GET" && url.pathname.match(/^\/api\/projects\/[^/]+\/conversations$/)) {
    if (!requireUserAuth(request, response)) return;
    const projectId = url.pathname.split("/")[3];
    try {
      const conversations = await getConversationsByProject(projectId);
      return json(response, 200, { ok: true, conversations });
    } catch (error) {
      return json(response, 500, { ok: false, error: error.message });
    }
  }

  if (request.method === "POST" && url.pathname === "/api/preferences/vendor") {
    if (!requireUserAuth(request, response)) return;
    try {
      const body = await parseBody(request);
      const { vendor, sentiment } = body;
      if (!vendor || !["preferred", "disliked"].includes(sentiment)) {
        return json(response, 400, { error: "vendor (string) and sentiment ('preferred'|'disliked') required" });
      }
      const userId = getSessionUserId(request);
      const result = await upsertVendorPreference(userId, vendor, sentiment);
      return json(response, 200, { ok: true, saved: result.saved });
    } catch (error) {
      return json(response, 500, { ok: false, error: error.message });
    }
  }

  if (request.method === "POST" && url.pathname === "/api/admin/invite") {
    if (!requireRole(request, response, ["admin", "manager"])) return;
    try {
      const body = await parseBody(request);
      const adminUserId = getSessionUserId(request);
      const result = await orgUserManager.inviteUser(adminUserId, body);
      return json(response, 201, { ok: true, user: result.user });
    } catch (error) {
      return json(response, 400, { ok: false, error: error.message });
    }
  }

  if (request.method === "GET" && url.pathname === "/api/org/members") {
    if (!requireUserAuth(request, response)) return;
    try {
      const user = getSessionUser(request);
      if (!user || !user.orgId) {
        return json(response, 400, { ok: false, error: "User does not belong to an organization" });
      }
      const members = await orgUserManager.listOrgMembers(user.orgId);
      return json(response, 200, { ok: true, members });
    } catch (error) {
      return json(response, 500, { ok: false, error: error.message });
    }
  }

  if (request.method === "POST" && url.pathname === "/api/org/members/role") {
    if (!requireRole(request, response, ["admin", "manager"])) return;
    try {
      const body = await parseBody(request);
      const { targetUserId, newRole } = body;
      const adminUserId = getSessionUserId(request);
      if (!targetUserId || !newRole) {
        return json(response, 400, { ok: false, error: "targetUserId and newRole are required" });
      }
      await orgUserManager.updateMemberRole(targetUserId, newRole, adminUserId);
      return json(response, 200, { ok: true });
    } catch (error) {
      return json(response, 400, { ok: false, error: error.message });
    }
  }

  if (request.method === "POST" && url.pathname.match(/^\/api\/projects\/[^/]+\/feedback$/)) {
    if (!requireUserAuth(request, response)) return;
    const projectId = url.pathname.split("/")[3];
    try {
      const body = await parseBody(request);
      const rating = parseInt(body.rating);
      if (isNaN(rating) || ![-1, 1].includes(rating)) {
        return json(response, 400, { ok: false, error: "Rating must be 1 (up) or -1 (down)" });
      }
      const userId = getSessionUserId(request);
      const result = await recordProjectFeedback(projectId, userId, rating);
      return json(response, 200, { ok: result.saved });
    } catch (error) {
      return json(response, 500, { ok: false, error: error.message });
    }
  }

  if (request.method === "GET" && url.pathname === "/api/admin/feedback") {
    if (!requireRole(request, response, ["admin"])) return;
    try {
      const feedback = await getAdminFeedbackSummary();
      return json(response, 200, { ok: true, feedback });
    } catch (error) {
      return json(response, 500, { ok: false, error: error.message });
    }
  }

  if (request.method === "GET" && url.pathname === "/api/admin/users") {
    if (!requireRole(request, response, ["admin"])) return;
    try {
      const client = getSupabaseAdmin();
      if (!client) {
        return json(response, 200, { ok: true, users: LOCAL_USERS.map(u => ({
          id: u.username, username: u.username, display_name: u.display_name, role: u.role ?? "engineer"
        })) });
      }
      const { data, error } = await client
        .from("users")
        .select("id, username, display_name, role, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return json(response, 200, { ok: true, users: data });
    } catch (error) {
      return json(response, 500, { ok: false, error: error.message });
    }
  }

  if (request.method === "POST" && url.pathname === "/api/admin/users") {
    if (!requireRole(request, response, ["admin"])) return;
    try {
      const { username, password, display_name, role } = await parseBody(request);
      if (!username || !password || !display_name) {
        return json(response, 400, { ok: false, error: "username, password, display_name required" });
      }
      const validRoles = ["admin", "manager", "engineer"];
      if (role && !validRoles.includes(role)) {
        return json(response, 400, { ok: false, error: "role must be admin, manager, or engineer" });
      }
      const client = getSupabaseAdmin();
      if (!client) return json(response, 501, { ok: false, error: "User management requires Supabase" });
      const bcrypt = await import("bcryptjs");
      const password_hash = await bcrypt.hash(password, 12);
      const { data, error } = await client
        .from("users")
        .insert({ username, password_hash, display_name, role: role ?? "engineer" })
        .select("id, username, display_name, role, created_at")
        .single();
      if (error) {
        if (error.code === "23505") return json(response, 409, { ok: false, error: "Username already exists" });
        throw error;
      }
      return json(response, 201, { ok: true, user: data });
    } catch (error) {
      return json(response, 500, { ok: false, error: error.message });
    }
  }

  if (request.method === "PATCH" && url.pathname.match(/^\/api\/admin\/users\/[^/]+$/)) {
    if (!requireRole(request, response, ["admin"])) return;
    try {
      const userId = url.pathname.split("/")[4];
      const { role, display_name } = await parseBody(request);
      const validRoles = ["admin", "manager", "engineer"];
      if (role && !validRoles.includes(role)) {
        return json(response, 400, { ok: false, error: "role must be admin, manager, or engineer" });
      }
      const client = getSupabaseAdmin();
      if (!client) return json(response, 501, { ok: false, error: "User management requires Supabase" });
      const patch = {};
      if (role) patch.role = role;
      if (display_name) patch.display_name = display_name;
      if (Object.keys(patch).length === 0) return json(response, 400, { ok: false, error: "Nothing to update" });
      const { data, error } = await client
        .from("users")
        .update(patch)
        .eq("id", userId)
        .select("id, username, display_name, role")
        .single();
      if (error) throw error;
      if (!data) return json(response, 404, { ok: false, error: "User not found" });
      return json(response, 200, { ok: true, user: data });
    } catch (error) {
      return json(response, 500, { ok: false, error: error.message });
    }
  }

  if (request.method === "DELETE" && url.pathname.match(/^\/api\/admin\/users\/[^/]+$/)) {
    if (!requireRole(request, response, ["admin"])) return;
    try {
      const userId = url.pathname.split("/")[4];
      const currentUserId = getSessionUserId(request);
      if (userId === currentUserId) {
        return json(response, 400, { ok: false, error: "Cannot delete your own account" });
      }
      const client = getSupabaseAdmin();
      if (!client) return json(response, 501, { ok: false, error: "User management requires Supabase" });
      const { error } = await client.from("users").delete().eq("id", userId);
      if (error) throw error;
      return json(response, 200, { ok: true });
    } catch (error) {
      return json(response, 500, { ok: false, error: error.message });
    }
  }

  if (request.method === "GET" && url.pathname.match(/^\/api\/projects\/[^/]+\/export\/pdf$/)) {
    if (!requireUserAuth(request, response)) return;
    const projectId = url.pathname.split("/")[3];
    const type = url.searchParams.get("type") || "proposal";
    try {
      const project = await getProjectById(projectId);
      if (!project) return json(response, 404, { ok: false, error: "Project not found" });

      let pdfBuffer;
      if (type === "bom") {
        const bom = await persistBomJson(projectId, {}); // Trigger reload or fetch existing
        pdfBuffer = await pdfEngine.generateBomPdf(bom, projectId);
      } else {
        // Proposal PDF needs full data
        const requirements = await persistRequirementsJson(projectId, {});
        const solution = await persistSolutionJson(projectId, {});
        const bom = await persistBomJson(projectId, {});

        // Re-construct data for PDF engine
        const proposalData = {
          customerName: project.customer_name,
          projectName: `${project.customer_name} Presale Proposal`,
          executiveSummary: "Loading...", // In real flow, fetch from persisted proposal JSON
          solutionOverview: "Loading...",
          bomRows: bom.rows || [],
          assumptions: [],
          nextSteps: []
        };
        pdfBuffer = await pdfEngine.generateProposalPdf(proposalData);
      }

      response.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${projectId}-export.pdf"`
      });
      response.end(pdfBuffer);
    } catch (error) {
      return json(response, 500, { ok: false, error: error.message });
    }
  }

  if (request.method === "GET" && url.pathname.match(/^\/api\/projects\/[^/]+\/export\/bom$/)) {
    if (!requireUserAuth(request, response)) return;
    const projectId = url.pathname.split("/")[3];
    try {
      const project = await getProjectById(projectId);
      if (!project || !project.bom_json?.rows?.length) {
        return json(response, 404, { ok: false, error: "BOM not found" });
      }

      const buffer = await bomExcelAgent.generateBOMBuffer(project.bom_json, projectId);
      response.writeHead(200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${projectId}-bom.xlsx"`
      });
      response.end(buffer);
    } catch (error) {
      return json(response, 500, { ok: false, error: error.message });
    }
  }

  if (request.method === "GET" && url.pathname.match(/^\/api\/projects\/[^/]+\/export\/solution$/)) {
    if (!requireUserAuth(request, response)) return;
    const projectId = url.pathname.split("/")[3];
    try {
      const project = await getProjectById(projectId);
      if (!project || !project.solution_json) {
        return json(response, 404, { ok: false, error: "Solution not found" });
      }

      const buffer = await buildSolutionBuffer({
        project,
        requirements: project.requirements_json,
        solution: project.solution_json,
        bomRows: project.bom_json?.rows ?? []
      });

      response.writeHead(200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${projectId}-solution.docx"`
      });
      response.end(buffer);
    } catch (error) {
      return json(response, 500, { ok: false, error: error.message });
    }
  }
  return serveFile(response, path.join(__dirname, "error", "404.html"), "text/html; charset=utf-8");
}

export function createAppServer() {
  return createServer(appHandler);
}

if (isMainModule) {
  if (!config.openai.apiKey && !config.forceLocalMode) {
    console.warn("[FATAL] OPENAI_API_KEY is not set — all AI calls will fail. Set the key or use AI_PRESALE_FORCE_LOCAL=1");
  }
  const server = createAppServer();
  server.listen(config.port, () => {
    console.log(`Franky-Presale server listening on http://localhost:${config.port}`);
    ensureUsersSeeded().catch((err) => console.warn("[seed] failed:", err.message));
    loadPersistedSessions().then(n => { if (n > 0) console.log(`[session] restored ${n} sessions`); }).catch((err) => console.warn("[session] restore failed:", err.message));
    checkKbCoverage().catch((err) => console.warn("[KB] coverage check failed:", err.message));
  });
}
