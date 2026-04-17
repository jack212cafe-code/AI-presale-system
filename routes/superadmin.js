import { getSupabaseAdmin } from '../lib/supabase.js';
import { buildUserSessionCookie, buildExpiredUserSessionCookie, getSessionUser, destroyUserSession, getUserSessionToken } from '../lib/user-auth.js';
import { requireUserAuth, json, parseBody } from './helpers.js';

const SUPERADMIN_COOKIE = "ai_presale_superadmin";

export async function handle(request, url, response) {
  if (request.method === "POST" && url.pathname === "/api/superadmin/login") {
    try {
      const payload = await parseBody(request);
      const password = payload.password;
      const expected = process.env.SUPERADMIN_PASSWORD;
      if (!expected || password !== expected) {
        return json(response, 401, { ok: false, error: "Invalid password" }), true;
      }
      const token = Buffer.from(`${Date.now()}:superadmin`).toString("base64");
      const cookie = `${SUPERADMIN_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`;
      json(response, 200, { ok: true }, { "Set-Cookie": cookie });
    } catch (error) {
      json(response, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/superadmin/logout") {
    json(
      response,
      200,
      { ok: true },
      { "Set-Cookie": `${SUPERADMIN_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0` }
    );
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/superadmin/session") {
    const cookies = parseCookies(request.headers.cookie);
    const token = cookies[SUPERADMIN_COOKIE];
    if (!token) {
      return json(response, 200, { ok: true, authenticated: false }), true;
    }
    json(response, 200, { ok: true, authenticated: true });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/superadmin/orgs") {
    const cookies = parseCookies(request.headers.cookie);
    if (!cookies[SUPERADMIN_COOKIE]) {
      return json(response, 401, { ok: false, error: "Unauthorized" }), true;
    }
    try {
      const client = getSupabaseAdmin();
      if (!client) {
        return json(response, 503, { ok: false, error: "Service unavailable" }), true;
      }

      const { data: orgs, error: orgsError } = await client
        .from("organizations")
        .select("id, name, status, created_at")
        .order("created_at", { ascending: false });

      if (orgsError) throw orgsError;

      const orgIds = (orgs ?? []).map((o) => o.id);
      const userCounts = {};
      if (orgIds.length > 0) {
        const { data: users } = await client
          .from("users")
          .select("org_id")
          .in("org_id", orgIds);
        for (const u of users ?? []) {
          userCounts[u.org_id] = (userCounts[u.org_id] ?? 0) + 1;
        }
      }

      const result = (orgs ?? []).map((org) => ({
        id: org.id,
        name: org.name,
        status: org.status ?? "active",
        user_count: userCounts[org.id] ?? 0
      }));

      json(response, 200, { ok: true, orgs: result });
    } catch (error) {
      json(response, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname.match(/^\/api\/superadmin\/orgs\/[^/]+\/(suspend|activate)$/)) {
    const cookies = parseCookies(request.headers.cookie);
    if (!cookies[SUPERADMIN_COOKIE]) {
      return json(response, 401, { ok: false, error: "Unauthorized" }), true;
    }
    const parts = url.pathname.split("/");
    const orgId = parts[3];
    const action = parts[5];
    const newStatus = action === "suspend" ? "suspended" : "active";
    try {
      const client = getSupabaseAdmin();
      if (!client) {
        return json(response, 503, { ok: false, error: "Service unavailable" }), true;
      }
      const { error } = await client
        .from("organizations")
        .update({ status: newStatus })
        .eq("id", orgId);
      if (error) throw error;
      json(response, 200, { ok: true, status: newStatus });
    } catch (error) {
      json(response, 500, { ok: false, error: error.message });
    }
    return true;
  }

  return false;
}

function parseCookies(header) {
  return String(header || "")
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .reduce((cks, part) => {
      const idx = part.indexOf("=");
      if (idx === -1) return cks;
      cks[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
      return cks;
    }, {});
}
