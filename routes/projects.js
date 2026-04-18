import { normalizeIntakePayload } from '../lib/intake.js';
import {
  createProjectRecord,
  getProjectById,
  listProjectsByUser,
  persistRequirementsJson,
  recordProjectFeedback,
  deleteProject
} from '../lib/projects.js';
import { runDiscoveryAgent } from '../agents/discovery.js';
import { runSolutionAgent } from '../agents/solution.js';
import { approveProject } from '../lib/projects.js';
import { getMessagesByConversation, getConversationsByProject } from '../lib/conversations.js';
import { upsertVendorPreference } from '../lib/user-preferences.js';
import { requireUserAuth, requireRole, json, parseBody } from './helpers.js';
import { getSessionUserId, getSessionUser } from '../lib/user-auth.js';
import { requireRateLimit } from '../lib/rate-limit.js';
import { saveCorrection } from '../lib/corrections.js';

export async function handle(request, url, response) {
  if (request.method === "POST" && url.pathname === "/api/intake") {
    if (!requireUserAuth(request, response)) return true;
    try {
      const rawPayload = await parseBody(request);
      const intake = normalizeIntakePayload(rawPayload);
      const user = getSessionUser(request);
      const result = await createProjectRecord(intake, user.userId, user.orgId);

      json(response, 201, {
        ok: true,
        mode: result.saved ? "integrated" : "local",
        project: result.project,
        warnings: result.warnings
      });
    } catch (error) {
      json(response, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/intake/analyze") {
    if (!requireUserAuth(request, response)) return true;
    if (!requireRateLimit(request, response, getSessionUserId(request), "pipeline")) return true;
    try {
      const rawPayload = await parseBody(request);
      const intake = normalizeIntakePayload(rawPayload);
      const user = getSessionUser(request);
      const created = await createProjectRecord(intake, user.userId, user.orgId);
      const requirements = await runDiscoveryAgent(intake, {
        projectId: created.project.id
      });

      const persisted = await persistRequirementsJson(created.project.id, requirements);

      json(response, 201, {
        ok: true,
        mode: created.saved ? "integrated" : "local",
        project: persisted.project ?? created.project,
        requirements,
        warnings: created.warnings
      });
    } catch (error) {
      json(response, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/solution") {
    if (!requireUserAuth(request, response)) return true;
    if (!requireRateLimit(request, response, getSessionUserId(request), "pipeline")) return true;
    try {
      const rawPayload = await parseBody(request);
      if (!rawPayload.project_id) {
        return json(response, 400, { ok: false, error: "project_id is required" }), true;
      }

      const user = getSessionUser(request);
      const project = await getProjectById(rawPayload.project_id, user.orgId);
      if (!project) {
        return json(response, 404, { ok: false, error: "Project not found" }), true;
      }
      if (!project.requirements_json) {
        return json(response, 400, { ok: false, error: "Discovery must be completed before solution design" }), true;
      }

      const solution = await runSolutionAgent(project.requirements_json, { projectId: project.id, orgId: user.orgId });
      json(response, 200, { ok: true, project_id: project.id, solution });
    } catch (error) {
      json(response, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/projects") {
    if (!requireUserAuth(request, response)) return true;
    try {
      const user = getSessionUser(request);
      const projects = await listProjectsByUser(user.userId, user.orgId);
      json(response, 200, { ok: true, projects });
    } catch (error) {
      json(response, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "DELETE" && url.pathname.match(/^\/api\/projects\/[^/]+$/)) {
    if (!requireUserAuth(request, response)) return true;
    const projectId = url.pathname.split("/")[3];
    try {
      const user = getSessionUser(request);
      const allowAny = user.role === "admin" || user.role === "superadmin";
      const result = await deleteProject(projectId, user.userId, user.orgId, { allowAny });
      if (!result.deleted) {
        const code = result.reason === "not_found" ? 404 : result.reason === "forbidden" ? 403 : 500;
        return json(response, code, { ok: false, error: result.reason }), true;
      }
      json(response, 200, { ok: true });
    } catch (error) {
      json(response, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "GET" && url.pathname.match(/^\/api\/projects\/[^/]+\/status$/)) {
    if (!requireUserAuth(request, response)) return true;
    const projectId = url.pathname.split("/")[3];
    try {
      const user = getSessionUser(request);
      const project = await getProjectById(projectId, user.orgId);
      if (!project) {
        return json(response, 404, { ok: false, error: "Project not found" }), true;
      }
      json(response, 200, { ok: true, project });
    } catch (error) {
      json(response, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname.match(/^\/api\/projects\/[^/]+\/approve$/)) {
    if (!requireRole(request, response, ["admin", "manager"])) return true;
    const projectId = url.pathname.split("/")[3];
    try {
      const user = getSessionUser(request);
      const project = await getProjectById(projectId, user.orgId);
      if (!project) {
        return json(response, 404, { ok: false, error: "Project not found" }), true;
      }
      await approveProject(projectId);
      json(response, 200, { ok: true, project_id: projectId, human_approved: true });
    } catch (error) {
      json(response, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname.match(/^\/api\/projects\/[^/]+\/corrections$/)) {
    if (!requireRole(request, response, ["admin"])) return true;
    const rawId = url.pathname.split("/")[3];
    const projectId = rawId === "general" ? null : rawId;
    try {
      const body = await parseBody(request);
      const { field, wrong_value, correct_value, note } = body ?? {};
      if (!field || !wrong_value || !correct_value) {
        return json(response, 400, { ok: false, error: "field, wrong_value, correct_value are required" }), true;
      }
      await saveCorrection({ projectId, field, wrongValue: wrong_value, correctValue: correct_value, note });
      json(response, 200, { ok: true });
    } catch (error) {
      json(response, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "GET" && url.pathname.match(/^\/api\/conversations\/[^/]+\/messages$/)) {
    if (!requireUserAuth(request, response)) return true;
    const conversationId = url.pathname.split("/")[3];
    try {
      const user = getSessionUser(request);
      const messages = await getMessagesByConversation(conversationId, user.orgId);
      json(response, 200, { ok: true, messages });
    } catch (error) {
      json(response, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "GET" && url.pathname.match(/^\/api\/projects\/[^/]+\/conversations$/)) {
    if (!requireUserAuth(request, response)) return true;
    const projectId = url.pathname.split("/")[3];
    try {
      const user = getSessionUser(request);
      const project = await getProjectById(projectId, user.orgId);
      if (!project) {
        return json(response, 404, { ok: false, error: "Project not found" }), true;
      }
      const conversations = await getConversationsByProject(projectId, user.orgId);
      json(response, 200, { ok: true, conversations });
    } catch (error) {
      json(response, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/preferences/vendor") {
    if (!requireUserAuth(request, response)) return true;
    try {
      const body = await parseBody(request);
      const { vendor, sentiment } = body;
      if (!vendor || !["preferred", "disliked"].includes(sentiment)) {
        return json(response, 400, { error: "vendor (string) and sentiment ('preferred'|'disliked') required" }), true;
      }
      const userId = getSessionUserId(request);
      const result = await upsertVendorPreference(userId, vendor, sentiment);
      json(response, 200, { ok: true, saved: result.saved });
    } catch (error) {
      json(response, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname.match(/^\/api\/projects\/[^/]+\/feedback$/)) {
    if (!requireUserAuth(request, response)) return true;
    const projectId = url.pathname.split("/")[3];
    try {
      const body = await parseBody(request);
      const rating = parseInt(body.rating);
      if (isNaN(rating) || ![-1, 1].includes(rating)) {
        return json(response, 400, { ok: false, error: "Rating must be 1 (up) or -1 (down)" }), true;
      }
      const user = getSessionUser(request);
      const project = await getProjectById(projectId, user.orgId);
      if (!project) {
        return json(response, 403, { ok: false, error: "Access denied" }), true;
      }
      const result = await recordProjectFeedback(projectId, user.userId, rating);
      json(response, 200, { ok: result.saved });
    } catch (error) {
      json(response, 500, { ok: false, error: error.message });
    }
    return true;
  }

  return false;
}
