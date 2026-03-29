import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";

import { getSupabaseAdmin } from "./supabase.js";

const SESSION_COOKIE = "ai_presale_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const sessions = new Map();

export function parseCookieHeader(header) {
  return String(header || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex === -1) {
        return cookies;
      }

      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(token);
    }
  }
}

export function createUserSession(userId, displayName) {
  cleanupExpiredSessions();
  const token = randomUUID();
  sessions.set(token, {
    userId,
    displayName,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return token;
}

export function destroyUserSession(token) {
  sessions.delete(token);
}

export function getUserSessionToken(request) {
  const cookies = parseCookieHeader(request.headers.cookie);
  return cookies[SESSION_COOKIE] || null;
}

export function isAuthenticatedUserRequest(request) {
  cleanupExpiredSessions();
  const token = getUserSessionToken(request);
  if (!token) {
    return false;
  }

  const session = sessions.get(token);
  if (!session) {
    return false;
  }

  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return true;
}

export function getSessionUserId(request) {
  const token = getUserSessionToken(request);
  if (!token) {
    return null;
  }

  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    return null;
  }

  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session.userId;
}

export function getSessionUser(request) {
  const token = getUserSessionToken(request);
  if (!token) {
    return null;
  }

  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    return null;
  }

  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return { userId: session.userId, displayName: session.displayName };
}

export function buildUserSessionCookie(token) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`;
}

export function buildExpiredUserSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function validateUserCredentials(username, password) {
  const client = getSupabaseAdmin();
  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from("users")
    .select("id, username, password_hash, display_name")
    .eq("username", username)
    .single();

  if (error || !data) {
    return null;
  }

  const valid = await bcrypt.compare(password, data.password_hash);
  if (!valid) {
    return null;
  }

  return { id: data.id, username: data.username, display_name: data.display_name };
}
