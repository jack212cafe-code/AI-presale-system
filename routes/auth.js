import {
  buildUserSessionCookie,
  buildExpiredUserSessionCookie,
  createUserSession,
  destroyUserSession,
  getSessionUser,
  getUserSessionToken,
  validateUserCredentials
} from '../lib/user-auth.js';
import { json, parseBody } from './helpers.js';
import { checkLoginLimit } from '../lib/rate-limit.js';

export async function handle(request, url, response) {
  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    try {
      const ip = request.headers['x-forwarded-for']?.split(',')[0]?.trim()
                 || request.socket?.remoteAddress
                 || 'unknown';
      const rl = await checkLoginLimit(ip);
      if (!rl.allowed) {
        return json(response, 429, {
          ok: false,
          error: `Too many login attempts — please wait ${rl.retryAfterSec} seconds`,
          retry_after_seconds: rl.retryAfterSec
        }), true;
      }
      const payload = await parseBody(request);
      const user = await validateUserCredentials(payload.username || "", payload.password || "");
      if (!user) {
        return json(response, 401, { ok: false, error: "Invalid credentials" }), true;
      }

      const token = await createUserSession(user.id, user.display_name);
      json(
        response,
        200,
        { ok: true, user: { id: user.id, username: user.username, display_name: user.display_name } },
        { "Set-Cookie": buildUserSessionCookie(token) }
      );
    } catch (error) {
      json(response, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = getUserSessionToken(request);
    if (token) {
      destroyUserSession(token);
    }
    json(
      response,
      200,
      { ok: true },
      { "Set-Cookie": buildExpiredUserSessionCookie() }
    );
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/auth/session") {
    const user = getSessionUser(request);
    if (!user) {
      json(response, 200, { ok: true, authenticated: false });
    } else {
      json(response, 200, { ok: true, authenticated: true, user });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/signup") {
    try {
      const ip = request.headers['x-forwarded-for']?.split(',')[0]?.trim()
                 || request.socket?.remoteAddress
                 || 'unknown';
      const rl = await checkLoginLimit(ip);
      if (!rl.allowed) {
        return json(response, 429, {
          ok: false,
          error: `Too many signup attempts — please wait ${rl.retryAfterSec} seconds`
        }), true;
      }
      const payload = await parseBody(request);
      const { company, username, password } = payload;

      if (!company || !username || !password) {
        return json(response, 400, { ok: false, error: "กรุณากรอกข้อมูลให้ครบ" }), true;
      }
      if (username.length < 3) {
        return json(response, 400, { ok: false, error: "ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร" }), true;
      }
      if (password.length < 6) {
        return json(response, 400, { ok: false, error: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" }), true;
      }

      const { getSupabaseAdmin } = await import('../lib/supabase.js');
      const client = getSupabaseAdmin();
      if (!client) {
        return json(response, 503, { ok: false, error: "บริการไม่พร้อมใช้งาน" }), true;
      }

      const { data: existing } = await client
        .from("users")
        .select("id")
        .eq("username", username)
        .maybeSingle();
      if (existing) {
        return json(response, 409, { ok: false, error: "ชื่อผู้ใช้นี้ถูกใช้งานแล้ว" }), true;
      }

      const { default: bcrypt } = await import("bcryptjs");
      const password_hash = await bcrypt.hash(password, 10);

      const { data: orgData, error: orgError } = await client
        .from("organizations")
        .insert({ name: company })
        .select("id")
        .single();
      if (orgError || !orgData) {
        return json(response, 500, { ok: false, error: "สร้างองค์กรไม่สำเร็จ กรุณาลองใหม่" }), true;
      }
      const orgId = orgData.id;

      const displayName = username;
      const { data: userData, error: userError } = await client
        .from("users")
        .insert({ username, password_hash, display_name: displayName, role: "engineer", org_id: orgId })
        .select("id")
        .single();
      if (userError || !userData) {
        await client.from("organizations").delete().eq("id", orgId);
        return json(response, 500, { ok: false, error: "สร้างผู้ใช้ไม่สำเร็จ กรุณาลองใหม่" }), true;
      }

      const token = await createUserSession(userData.id, displayName);
      json(
        response,
        200,
        { ok: true },
        { "Set-Cookie": buildUserSessionCookie(token) }
      );
    } catch (error) {
      json(response, 500, { ok: false, error: error.message });
    }
    return true;
  }

  return false;
}
