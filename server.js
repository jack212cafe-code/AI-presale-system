import "dotenv/config";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeKnowledgeDeletePayload, normalizeKnowledgeUploadPayload } from "./lib/admin-kb.js";
import {
  buildAdminSessionCookie,
  buildExpiredAdminSessionCookie,
  createAdminSession,
  destroyAdminSession,
  getAdminSessionToken,
  isAdminAuthConfigured,
  isAuthenticatedAdminRequest,
  validateAdminPassword
} from "./lib/admin-auth.js";
import {
  buildUserSessionCookie,
  buildExpiredUserSessionCookie,
  createUserSession,
  destroyUserSession,
  getSessionUser,
  getSessionUserId,
  getUserSessionToken,
  isAuthenticatedUserRequest,
  validateUserCredentials
} from "./lib/user-auth.js";
import { createJob, getJob, updateJob } from "./lib/admin-jobs.js";
import { normalizeIntakePayload } from "./lib/intake.js";
import { approveProject, createProjectRecord, getProjectById, listProjectsByUser, persistBomJson, persistRequirementsJson, persistSolutionJson, persistProposalMetadata } from "./lib/projects.js";
import { runDiscoveryAgent } from "./agents/discovery.js";
import { runSolutionAgent } from "./agents/solution.js";
import { runBomAgent } from "./agents/bom.js";
import { runProposalAgent } from "./agents/proposal.js";
import { handleChatMessage } from "./lib/chat.js";
import { deleteKnowledgeDocumentBySourceFile, getSupabaseAdmin, listKnowledgeDocuments } from "./lib/supabase.js";
import { config } from "./lib/config.js";
import { deleteRawDocumentFiles, importRawDocuments, saveUploadedRawDocument } from "./knowledge_base/raw-import-lib.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isMainModule = process.argv[1] === __filename;

function json(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders
  });
  response.end(JSON.stringify(payload, null, 2));
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
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function requireAdminAuth(request, response) {
  if (!isAdminAuthConfigured()) {
    json(response, 503, { ok: false, error: "ADMIN_PORTAL_PASSWORD is not configured" });
    return false;
  }

  if (!isAuthenticatedAdminRequest(request)) {
    json(response, 401, { ok: false, error: "Authentication required" });
    return false;
  }

  return true;
}

function requireUserAuth(request, response) {
  if (!isAuthenticatedUserRequest(request)) {
    json(response, 401, { ok: false, error: "Authentication required" });
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

  if (request.method === "GET" && url.pathname === "/health") {
    return json(response, 200, {
      status: "ok",
      mode: getSupabaseAdmin() ? "integrated" : "local",
      timestamp: new Date().toISOString()
    });
  }

  if (request.method === "GET" && url.pathname === "/") {
    return serveFile(response, path.join(__dirname, "intake", "index.html"), "text/html; charset=utf-8");
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
    if (!requireUserAuth(request, response)) return;
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

  if (request.method === "GET" && url.pathname === "/api/admin/kb/documents") {
    if (!requireAdminAuth(request, response)) {
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
    if (!isAdminAuthConfigured()) {
      return json(response, 503, { ok: false, configured: false, error: "ADMIN_PORTAL_PASSWORD is not configured" });
    }

    return json(response, 200, {
      ok: true,
      configured: true,
      authenticated: isAuthenticatedAdminRequest(request)
    });
  }

  if (request.method === "POST" && url.pathname === "/api/admin/login") {
    try {
      const payload = await parseBody(request);
      if (!validateAdminPassword(payload.password || "")) {
        return json(response, 401, { ok: false, error: "Invalid password" });
      }

      const token = createAdminSession();
      return json(
        response,
        200,
        { ok: true, authenticated: true },
        { "Set-Cookie": buildAdminSessionCookie(token) }
      );
    } catch (error) {
      return json(response, 400, { ok: false, error: error.message });
    }
  }

  if (request.method === "POST" && url.pathname === "/api/admin/logout") {
    const token = getAdminSessionToken(request);
    if (token) {
      destroyAdminSession(token);
    }

    return json(
      response,
      200,
      { ok: true, authenticated: false },
      { "Set-Cookie": buildExpiredAdminSessionCookie() }
    );
  }

  if (request.method === "POST" && url.pathname === "/api/admin/kb/upload") {
    if (!requireAdminAuth(request, response)) {
      return;
    }

    try {
      const payload = normalizeKnowledgeUploadPayload(await parseBody(request));
      const savedFile = await saveUploadedRawDocument({
        fileName: payload.file_name,
        contentBase64: payload.content_base64,
        metadata: payload.metadata
      });
      const jobId = createJob({
        status: "queued",
        stage: "queued",
        progress_percent: 0,
        message: `Queued import for ${savedFile.relativePath}`,
        source_file: savedFile.relativePath
      });
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
    if (!requireAdminAuth(request, response)) {
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
    if (!requireAdminAuth(request, response)) {
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

      // Stage 3: Solution
      stageFailed = "solution";
      const solution = await runSolutionAgent(requirements, { projectId });
      await persistSolutionJson(projectId, solution);

      // Stage 4: BOM
      stageFailed = "bom";
      const bom = await runBomAgent(solution, { projectId });
      await persistBomJson(projectId, bom);

      // Auto-approve before proposal (per D-03: gate disabled for team self-review)
      await approveProject(projectId);

      // Stage 5: Proposal
      stageFailed = "proposal";
      const proposalResult = await runProposalAgent(intake, requirements, solution, bom, { projectId });

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
    try {
      const payload = await parseBody(request);
      if (!payload.message || typeof payload.message !== "string" || !payload.message.trim()) {
        return json(response, 400, { ok: false, error: "message is required" });
      }
      const userId = getSessionUserId(request);
      const result = await handleChatMessage({
        conversationId: payload.conversation_id || null,
        message: payload.message,
        userId
      });

      return json(response, result.created ? 201 : 200, {
        ok: true,
        conversation_id: result.conversation_id,
        project_id: result.project_id,
        stage: result.stage,
        text: result.text
      });
    } catch (error) {
      return json(response, 500, { ok: false, error: error.message });
    }
  }

  return json(response, 404, { error: "Route not found" });
}

export function createAppServer() {
  return createServer(appHandler);
}

if (isMainModule) {
  const server = createAppServer();
  server.listen(config.port, () => {
    console.log(`AI Presale intake server listening on http://localhost:${config.port}`);
  });
}
