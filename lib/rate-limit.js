// WARNING: In-memory rate limiter — resets on server restart and does NOT share
// state across multiple processes or instances. For multi-process or clustered
// deployments, replace with a Supabase-backed (or Redis-backed) counter.
import { config } from "./config.js";

const windows = new Map();

const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanupExpired() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, win] of windows) {
    if (now - win.windowStart > win.windowMs) windows.delete(key);
  }
}

function getWindow(key, windowMs) {
  const now = Date.now();
  let win = windows.get(key);
  if (!win || now - win.windowStart > windowMs) {
    win = { windowStart: now, windowMs, count: 0 };
    windows.set(key, win);
  }
  return win;
}

function checkLimit(userId, bucket, maxRequests, windowMs) {
  cleanupExpired();
  const key = `${userId}:${bucket}`;
  const win = getWindow(key, windowMs);
  win.count++;
  if (win.count > maxRequests) {
    const retryAfterSec = Math.ceil((win.windowStart + windowMs - Date.now()) / 1000);
    return { allowed: false, retryAfterSec };
  }
  return { allowed: true };
}

export function requireRateLimit(request, response, userId, bucket) {
  const limits = config.rateLimit?.[bucket];
  if (!limits) return true;

  const { allowed, retryAfterSec } = checkLimit(userId, bucket, limits.max, limits.windowMs);
  if (!allowed) {
    response.writeHead(429, {
      "Content-Type": "application/json; charset=utf-8",
      "Retry-After": String(retryAfterSec)
    });
    response.end(JSON.stringify({
      ok: false,
      error: `Rate limit exceeded — ใช้งานได้สูงสุด ${limits.max} requests ต่อ ${Math.round(limits.windowMs / 60000)} นาที กรุณารอ ${retryAfterSec} วินาที`,
      retry_after_seconds: retryAfterSec
    }));
    return false;
  }
  return true;
}

export function resetRateLimits() {
  windows.clear();
}
