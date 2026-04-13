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

      const token = createUserSession(user.id, user.display_name);
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

  return false;
}
