import { readFile } from 'node:fs/promises';
import { isAuthenticatedUserRequest, getSessionRole } from '../lib/user-auth.js';

export function json(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders
  });
  response.end(JSON.stringify(payload));
}

export async function serveFile(response, filePath, contentType) {
  try {
    const file = await readFile(filePath);
    response.writeHead(200, { "Content-Type": contentType });
    response.end(file);
  } catch (error) {
    json(response, 404, { error: "Not found", detail: error.message });
  }
}

export async function parseBody(request) {
  const MAX_BODY_BYTES = 50 * 1024 * 1024;
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) {
      request.destroy();
      const err = new Error("Request body too large");
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function requireUserAuth(request, response) {
  if (!isAuthenticatedUserRequest(request)) {
    json(response, 401, { ok: false, error: "Authentication required" });
    return false;
  }
  return true;
}

export function requireRole(request, response, roles) {
  if (!isAuthenticatedUserRequest(request)) {
    json(response, 401, { ok: false, error: "Authentication required" });
    return false;
  }
  const role = getSessionRole(request);
  if (!roles.includes(role)) {
    json(response, 403, { ok: false, error: "Insufficient permissions" });
    return false;
  }
  return true;
}
