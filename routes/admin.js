import { normalizeKnowledgeDeletePayload, normalizeKnowledgeUploadPayload } from '../lib/admin-kb.js';
import {
  LOCAL_USERS,
  buildUserSessionCookie,
  buildExpiredUserSessionCookie,
  createUserSession,
  destroyUserSession,
  getSessionRole,
  getSessionUser,
  getSessionUserId,
  getUserSessionToken,
  isAuthenticatedUserRequest,
  validateUserCredentials
} from '../lib/user-auth.js';
import { createJob, getJob, updateJob } from '../lib/admin-jobs.js';
import { deleteKnowledgeDocumentBySourceFile, getSupabaseAdmin, listKnowledgeDocuments, readAgentLogs } from '../lib/supabase.js';
import { deleteRawDocumentFiles, importRawDocuments, saveUploadedRawDocument } from '../knowledge_base/raw-import-lib.js';
import { orgUserManager } from '../lib/org-user-manager.js';
import { listCorrections, aggregateCorrectionsToKb } from '../lib/corrections.js';
import { getAdminFeedbackSummary } from '../lib/projects.js';
import { listWikiPages, deleteWikiPage as deleteWikiPageDb } from '../lib/db/wiki.js';
import { generateWikiPageFromText } from '../lib/wiki-generator.js';
import { requireRole, requireUserAuth, json, parseBody } from './helpers.js';

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
      console.error("[kb-import] job failed:", error);
      updateJob(jobId, {
        status: "failed",
        stage: "failed",
        progress_percent: 100,
        message: error.message,
        error: error.message
      });
    });
}

export async function handle(request, url, response) {
  if (request.method === "GET" && url.pathname === "/api/admin/session") {
    const role = getSessionRole(request);
    const authenticated = isAuthenticatedUserRequest(request) && role === "admin";
    json(response, 200, { ok: true, configured: true, authenticated, role: role ?? null });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/login") {
    try {
      const payload = await parseBody(request);
      const user = await validateUserCredentials(payload.username || "", payload.password || "");
      if (!user || user.role !== "admin") {
        return json(response, 401, { ok: false, error: "Invalid credentials or insufficient role" }), true;
      }
      const token = createUserSession(user.id, user.display_name, user.role);
      json(
        response,
        200,
        { ok: true, authenticated: true, role: user.role },
        { "Set-Cookie": buildUserSessionCookie(token) }
      );
    } catch (error) {
      json(response, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/logout") {
    const token = getUserSessionToken(request);
    if (token) destroyUserSession(token);
    json(
      response,
      200,
      { ok: true, authenticated: false },
      { "Set-Cookie": buildExpiredUserSessionCookie() }
    );
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/audit") {
    if (!requireRole(request, response, ["admin"])) return true;
    try {
      const logs = await readAgentLogs(200);
      json(response, 200, { ok: true, logs });
    } catch (error) {
      json(response, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/corrections") {
    if (!requireRole(request, response, ["admin"])) return true;
    try {
      const corrections = await listCorrections({ limit: 100 });
      json(response, 200, { ok: true, corrections });
    } catch (error) {
      json(response, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/corrections/aggregate") {
    if (!requireRole(request, response, ["admin"])) return true;
    try {
      const result = await aggregateCorrectionsToKb();
      json(response, 200, { ok: true, kb_entries_upserted: result.count });
    } catch (error) {
      json(response, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/kb/documents") {
    if (!requireRole(request, response, ["admin"])) return true;
    try {
      const documents = await listKnowledgeDocuments();
      json(response, 200, { ok: true, documents });
    } catch (error) {
      json(response, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/kb/upload") {
    if (!requireRole(request, response, ["admin"])) return true;
    try {
      const rawPayload = await parseBody(request);
      const payload = normalizeKnowledgeUploadPayload(rawPayload);
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

      json(response, 202, {
        ok: true,
        message: "Document upload accepted",
        source_file: savedFile.relativePath,
        job_id: jobId
      });
    } catch (error) {
      json(response, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/admin/kb/jobs/")) {
    if (!requireRole(request, response, ["admin"])) return true;
    const jobId = url.pathname.slice("/api/admin/kb/jobs/".length);
    const job = getJob(jobId);
    if (!job) {
      json(response, 404, { ok: false, error: "Job not found" });
      return true;
    }
    json(response, 200, { ok: true, job });
    return true;
  }

  if (request.method === "DELETE" && url.pathname === "/api/admin/kb/documents") {
    if (!requireRole(request, response, ["admin"])) return true;
    try {
      const payload = normalizeKnowledgeDeletePayload(await parseBody(request));
      const result = await deleteKnowledgeDocumentBySourceFile(payload.source_file);
      await deleteRawDocumentFiles(payload.source_file);

      json(response, 200, {
        ok: true,
        deleted_chunks: result.deleted,
        source_file: payload.source_file
      });
    } catch (error) {
      json(response, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/invite") {
    if (!requireRole(request, response, ["admin", "manager"])) return true;
    try {
      const body = await parseBody(request);
      const adminUserId = getSessionUserId(request);
      const result = await orgUserManager.inviteUser(adminUserId, body);
      json(response, 201, { ok: true, user: result.user });
    } catch (error) {
      json(response, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/org/members") {
    if (!requireUserAuth(request, response)) return true;
    try {
      const user = getSessionUser(request);
      if (!user || !user.orgId) {
        return json(response, 400, { ok: false, error: "User does not belong to an organization" }), true;
      }
      const members = await orgUserManager.listOrgMembers(user.orgId);
      json(response, 200, { ok: true, members });
    } catch (error) {
      json(response, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/org/members/role") {
    if (!requireRole(request, response, ["admin", "manager"])) return true;
    try {
      const body = await parseBody(request);
      const { targetUserId, newRole } = body;
      const adminUserId = getSessionUserId(request);
      if (!targetUserId || !newRole) {
        return json(response, 400, { ok: false, error: "targetUserId and newRole are required" }), true;
      }
      await orgUserManager.updateMemberRole(targetUserId, newRole, adminUserId);
      json(response, 200, { ok: true });
    } catch (error) {
      json(response, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/feedback") {
    if (!requireRole(request, response, ["admin"])) return true;
    try {
      const feedback = await getAdminFeedbackSummary();
      json(response, 200, { ok: true, feedback });
    } catch (error) {
      json(response, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/users") {
    if (!requireRole(request, response, ["admin"])) return true;
    try {
      const client = getSupabaseAdmin();
      if (!client) {
        return json(response, 200, { ok: true, users: LOCAL_USERS.map(u => ({
          id: u.username, username: u.username, display_name: u.display_name, role: u.role ?? "engineer"
        })) }), true;
      }
      const { data, error } = await client
        .from("users")
        .select("id, username, display_name, role, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      json(response, 200, { ok: true, users: data });
    } catch (error) {
      json(response, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/users") {
    if (!requireRole(request, response, ["admin"])) return true;
    try {
      const { username, password, display_name, role } = await parseBody(request);
      if (!username || !password || !display_name) {
        return json(response, 400, { ok: false, error: "username, password, display_name required" }), true;
      }
      const validRoles = ["admin", "manager", "engineer"];
      if (role && !validRoles.includes(role)) {
        return json(response, 400, { ok: false, error: "role must be admin, manager, or engineer" }), true;
      }
      const client = getSupabaseAdmin();
      if (!client) return json(response, 501, { ok: false, error: "User management requires Supabase" }), true;
      const bcrypt = await import("bcryptjs");
      const password_hash = await bcrypt.hash(password, 12);
      const { data, error } = await client
        .from("users")
        .insert({ username, password_hash, display_name, role: role ?? "engineer" })
        .select("id, username, display_name, role, created_at")
        .single();
      if (error) {
        if (error.code === "23505") return json(response, 409, { ok: false, error: "Username already exists" }), true;
        throw error;
      }
      json(response, 201, { ok: true, user: data });
    } catch (error) {
      json(response, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "PATCH" && url.pathname.match(/^\/api\/admin\/users\/[^/]+$/)) {
    if (!requireRole(request, response, ["admin"])) return true;
    try {
      const userId = url.pathname.split("/")[4];
      const { role, display_name } = await parseBody(request);
      const validRoles = ["admin", "manager", "engineer"];
      if (role && !validRoles.includes(role)) {
        return json(response, 400, { ok: false, error: "role must be admin, manager, or engineer" }), true;
      }
      const client = getSupabaseAdmin();
      if (!client) return json(response, 501, { ok: false, error: "User management requires Supabase" }), true;
      const patch = {};
      if (role) patch.role = role;
      if (display_name) patch.display_name = display_name;
      if (Object.keys(patch).length === 0) return json(response, 400, { ok: false, error: "Nothing to update" }), true;
      const { data, error } = await client
        .from("users")
        .update(patch)
        .eq("id", userId)
        .select("id, username, display_name, role")
        .single();
      if (error) throw error;
      if (!data) return json(response, 404, { ok: false, error: "User not found" }), true;
      json(response, 200, { ok: true, user: data });
    } catch (error) {
      json(response, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "DELETE" && url.pathname.match(/^\/api\/admin\/users\/[^/]+$/)) {
    if (!requireRole(request, response, ["admin"])) return true;
    try {
      const userId = url.pathname.split("/")[4];
      const currentUserId = getSessionUserId(request);
      if (userId === currentUserId) {
        return json(response, 400, { ok: false, error: "Cannot delete your own account" }), true;
      }
      const client = getSupabaseAdmin();
      if (!client) return json(response, 501, { ok: false, error: "User management requires Supabase" }), true;
      const { error } = await client.from("users").delete().eq("id", userId);
      if (error) throw error;
      json(response, 200, { ok: true });
    } catch (error) {
      json(response, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/wiki/pages") {
    if (!requireRole(request, response, ["admin"])) return true;
    try {
      const pages = await listWikiPages();
      json(response, 200, { ok: true, pages });
    } catch (error) {
      json(response, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/wiki/generate") {
    if (!requireRole(request, response, ["admin"])) return true;
    try {
      const { source_file } = await parseBody(request);
      if (!source_file) return json(response, 400, { ok: false, error: "source_file required" }), true;
      const jobId = createJob({
        status: "queued",
        stage: "extracting",
        progress_percent: 0,
        message: `Generating wiki page for ${source_file}`,
        source_file
      });
      const fs = await import("fs/promises");
      const path = await import("path");
      const RAW_BASE = path.resolve(process.cwd(), "knowledge_base/raw");
      const fullPath = path.join(RAW_BASE, source_file);
      (async () => {
        try {
          updateJob(jobId, { stage: "extracting", progress_percent: 20, message: "Reading document text" });
          const buf = await fs.readFile(fullPath);
          const ext = path.extname(fullPath).toLowerCase();
          let text = "";
          if (ext === ".pdf") {
            const pdfParse = (await import("pdf-parse")).default;
            text = (await pdfParse(buf)).text;
          } else if (ext === ".docx") {
            const mammoth = (await import("mammoth")).default;
            text = (await mammoth.extractRawText({ buffer: buf })).value;
          } else if (ext === ".md" || ext === ".txt") {
            text = buf.toString("utf-8");
          } else {
            throw new Error(`Unsupported file type: ${ext}`);
          }
          updateJob(jobId, { stage: "generating", progress_percent: 50, message: "Calling LLM to generate wiki page" });
          const sourceDocumentKeys = [source_file];
          const result = await generateWikiPageFromText({ extractedText: text, fileName: path.basename(fullPath), sourceDocumentKeys });
          updateJob(jobId, { status: "completed", stage: "completed", progress_percent: 100, message: "Wiki page generated", result: { product_name: result.page?.product_name } });
        } catch (error) {
          console.error("[wiki-gen] job failed:", error);
          updateJob(jobId, { status: "failed", stage: "failed", progress_percent: 100, message: error.message, error: error.message });
        }
      })();
      json(response, 202, { ok: true, message: "Wiki generation started", job_id: jobId });
    } catch (error) {
      json(response, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/wiki/generate-all") {
    if (!requireRole(request, response, ["admin"])) return true;
    try {
      const fs = await import("fs/promises");
      const path = await import("path");
      const RAW_BASE = path.resolve(process.cwd(), "knowledge_base/raw");
      const SUPPORTED = [".pdf", ".docx", ".md", ".txt"];
      const entries = await fs.readdir(RAW_BASE, { withFileTypes: true });
      const files = [];
      for (const entry of entries) {
        if (entry.isFile() && SUPPORTED.includes(path.extname(entry.name).toLowerCase())) {
          files.push(entry.name);
        }
        if (entry.isDirectory() && entry.name === "uploads") {
          const uploads = await fs.readdir(path.join(RAW_BASE, "uploads"), { withFileTypes: true });
          for (const u of uploads) {
            if (u.isFile() && SUPPORTED.includes(path.extname(u.name).toLowerCase())) {
              files.push(`uploads/${u.name}`);
            }
          }
        }
      }
      const jobId = createJob({ status: "queued", stage: "scanning", progress_percent: 0, message: `Found ${files.length} documents`, total: files.length });
      (async () => {
        let generated = 0;
        for (let i = 0; i < files.length; i++) {
          try {
            const rel = files[i];
            const fullPath = path.join(RAW_BASE, rel);
            const buf = await fs.readFile(fullPath);
            const ext = path.extname(fullPath).toLowerCase();
            let text = "";
            if (ext === ".pdf") {
              const pdfParse = (await import("pdf-parse")).default;
              text = (await pdfParse(buf)).text;
            } else if (ext === ".docx") {
              const mammoth = (await import("mammoth")).default;
              text = (await mammoth.extractRawText({ buffer: buf })).value;
            } else {
              text = buf.toString("utf-8");
            }
            updateJob(jobId, { stage: "generating", progress_percent: Math.round(((i + 1) / files.length) * 100), message: `Generating ${rel} (${i + 1}/${files.length})` });
            await generateWikiPageFromText({ extractedText: text, fileName: path.basename(fullPath), sourceDocumentKeys: [rel] });
            generated++;
          } catch (err) {
            console.error(`[wiki-gen-all] skipped ${files[i]}: ${err.message}`);
          }
        }
        updateJob(jobId, { status: "completed", stage: "completed", progress_percent: 100, message: `Generated ${generated} wiki pages`, result: { generated } });
      })();
      json(response, 202, { ok: true, message: "Batch wiki generation started", job_id: jobId, total_documents: files.length });
    } catch (error) {
      json(response, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "DELETE" && url.pathname.startsWith("/api/admin/wiki/pages/")) {
    if (!requireRole(request, response, ["admin"])) return true;
    try {
      const pageId = url.pathname.slice("/api/admin/wiki/pages/".length);
      const result = await deleteWikiPageDb(pageId);
      json(response, 200, { ok: true, deleted: result.deleted });
    } catch (error) {
      json(response, 400, { ok: false, error: error.message });
    }
    return true;
  }

  return false;
}
