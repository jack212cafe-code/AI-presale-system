import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

import { config } from "./config.js";

const SESSION_COOKIE = "ai_presale_admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const sessions = new Map();

function sha256(value) {
  return createHash("sha256").update(String(value || ""), "utf8").digest();
}

function parseCookieHeader(header) {
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

export function isAdminAuthConfigured() {
  return Boolean(config.admin.password);
}

export function validateAdminPassword(password) {
  if (!isAdminAuthConfigured()) {
    throw new Error("ADMIN_PORTAL_PASSWORD is not configured");
  }

  const expected = sha256(config.admin.password);
  const actual = sha256(password);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createAdminSession() {
  cleanupExpiredSessions();
  const token = randomUUID();
  sessions.set(token, {
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return token;
}

export function destroyAdminSession(token) {
  sessions.delete(token);
}

export function getAdminSessionToken(request) {
  const cookies = parseCookieHeader(request.headers.cookie);
  return cookies[SESSION_COOKIE] || null;
}

export function isAuthenticatedAdminRequest(request) {
  cleanupExpiredSessions();
  const token = getAdminSessionToken(request);
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

export function buildAdminSessionCookie(token) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(
    SESSION_TTL_MS / 1000
  )}`;
}

export function buildExpiredAdminSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}
