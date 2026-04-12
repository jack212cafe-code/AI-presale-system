import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";

import { getSupabaseAdmin } from "./supabase.js";
import { logger } from "./logger.js";

export const LOCAL_USERS = [
  { username: "admin", password_hash: "$2a$12$TK8CJhj.KZqJ1KVzDiKEOui0z5Nd5Cqf9lqGaA5FkI7Y/3SAL1IIW", display_name: "Administrator", role: "admin" },
  { username: "manager1", password_hash: "$2b$12$6M5ynYwPMUzRLjU7zH3/yOC/cmthapwcZ9RAfYe1rd2/v5fEnbBZq", display_name: "Manager 1", role: "manager" },
  { username: "user1", password_hash: "$2b$12$6M5ynYwPMUzRLjU7zH3/yOC/cmthapwcZ9RAfYe1rd2/v5fEnbBZq", display_name: "User 1", role: "engineer" },
  { username: "user2", password_hash: "$2b$12$6M5ynYwPMUzRLjU7zH3/yOC/cmthapwcZ9RAfYe1rd2/v5fEnbBZq", display_name: "User 2", role: "engineer" },
  { username: "user3", password_hash: "$2b$12$6M5ynYwPMUzRLjU7zH3/yOC/cmthapwcZ9RAfYe1rd2/v5fEnbBZq", display_name: "User 3", role: "engineer" }
];

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

export function createUserSession(userId, displayName, role = "engineer") {
  cleanupExpiredSessions();
  const token = randomUUID();
  const session = {
    userId,
    displayName,
    role,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS
  };
  sessions.set(token, session);
  persistSession(token, session);
  return token;
}

export function destroyUserSession(token) {
  sessions.delete(token);
  removePersistedSession(token);
}

function persistSession(token, session) {
  const client = getSupabaseAdmin();
  if (!client) return;
  client.from("sessions").upsert({
    token,
    user_id: session.userId,
    display_name: session.displayName,
    role: session.role,
    created_at: session.createdAt,
    expires_at: session.expiresAt
  }, { onConflict: "token" }).then(({ error }) => {
    if (error) logger.warn("session.persist_failed", { error: error.message });
  });
}

function removePersistedSession(token) {
  const client = getSupabaseAdmin();
  if (!client) return;
  client.from("sessions").delete().eq("token", token).then(({ error }) => {
    if (error) logger.warn("session.remove_failed", { error: error.message });
  });
}

export async function loadPersistedSessions() {
  const client = getSupabaseAdmin();
  if (!client) return 0;
  const now = Date.now();
  const { data, error } = await client
    .from("sessions")
    .select("token, user_id, display_name, role, created_at, expires_at")
    .gt("expires_at", now);
  if (error) {
    logger.warn("session.load_failed", { error: error.message });
    return 0;
  }
  for (const row of data ?? []) {
    sessions.set(row.token, {
      userId: row.user_id,
      displayName: row.display_name,
      role: row.role,
      createdAt: row.created_at,
      expiresAt: row.expires_at
    });
  }
  // Cleanup expired from DB
  client.from("sessions").delete().lte("expires_at", now).then(() => {});
  return data?.length ?? 0;
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
  return { userId: session.userId, displayName: session.displayName, role: session.role ?? "engineer", orgId: session.orgId };
}

export function getSessionRole(request) {
  const token = getUserSessionToken(request);
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) return null;
  return session.role ?? "engineer";
}


const isHttps = (process.env.PUBLIC_BASE_URL || "").startsWith("https://");
const SECURE_FLAG = isHttps ? "; Secure" : "";

export function buildUserSessionCookie(token) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${SECURE_FLAG}`;
}

export function buildExpiredUserSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${SECURE_FLAG}`;
}

export async function validateUserCredentials(username, password) {
  const client = getSupabaseAdmin();
  if (!client) {
    const local = LOCAL_USERS.find((u) => u.username === username);
    if (!local) return null;
    const valid = await bcrypt.compare(password, local.password_hash);
    if (!valid) return null;
    return { id: local.username, username: local.username, display_name: local.display_name, role: local.role ?? "engineer" };
  }

  const { data, error } = await client
    .from("users")
    .select("id, username, password_hash, display_name, role")
    .eq("username", username)
    .single();

  if (error || !data) {
    // Fallback to LOCAL_USERS if DB has no record
    const local = LOCAL_USERS.find((u) => u.username === username);
    if (!local) return null;
    const valid = await bcrypt.compare(password, local.password_hash);
    if (!valid) return null;
    return { id: local.username, username: local.username, display_name: local.display_name, role: local.role ?? "engineer" };
  }

  const valid = await bcrypt.compare(password, data.password_hash);
  if (!valid) {
    return null;
  }

  return { id: data.id, username: data.username, display_name: data.display_name, role: data.role ?? "engineer" };
}

export async function ensureUsersSeeded() {
  const client = getSupabaseAdmin();
  if (!client) return;

  for (const user of LOCAL_USERS) {
    await client
      .from("users")
      .upsert(
        { username: user.username, password_hash: user.password_hash, display_name: user.display_name, role: user.role ?? "engineer" },
        { onConflict: "username" }
      )
      .then(({ error }) => {
        if (error) logger.warn("seed.upsert_failed", { username: user.username, error: error.message });
      });
  }
  logger.info("seed.users_ready");
}
