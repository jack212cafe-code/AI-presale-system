import "dotenv/config";
import { config } from "./lib/config.js";
import * as Sentry from "@sentry/node";

if (config.sentry.dsn) {
  Sentry.init({
    dsn: config.sentry.dsn,
    environment: process.env.NODE_ENV || "production",
    tracesSampleRate: 0.1
  });
}
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { handle as handleHealth } from './routes/health.js';
import { handle as handleStatic } from './routes/static.js';
import { handle as handleAuth } from './routes/auth.js';
import { handle as handleAdmin } from './routes/admin.js';
import { handle as handleProjects } from './routes/projects.js';
import { handle as handleChat } from './routes/chat.js';
import { handle as handleTor } from './routes/tor.js';
import { handle as handleExports } from './routes/exports.js';
import { serveFile } from './routes/helpers.js';
import { ensureUsersSeeded, loadPersistedSessions } from './lib/user-auth.js';
import { checkKbCoverage } from './scripts/check-kb-coverage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isMainModule = process.argv[1] === __filename;

export async function appHandler(request, response) {
  try {
    return await _appHandler(request, response);
  } catch (err) {
    console.error("[appHandler] unhandled:", err);
    if (!response.headersSent) {
      try { response.writeHead(500, { "Content-Type": "application/json" }); response.end(JSON.stringify({ ok: false, error: "Internal server error" })); } catch {}
    }
  }
}

async function _appHandler(request, response) {
  const url = new URL(request.url ?? "/", config.publicBaseUrl);
  console.log(`[req] ${request.method} ${url.pathname}`);

  if (await handleHealth(request, url, response)) return;
  if (await handleAuth(request, url, response)) return;
  if (await handleAdmin(request, url, response)) return;
  if (await handleProjects(request, url, response)) return;
  if (await handleChat(request, url, response)) return;
  if (await handleTor(request, url, response)) return;
  if (await handleExports(request, url, response)) return;
  if (await handleStatic(request, url, response)) return;

  return serveFile(response, path.join(__dirname, "error", "404.html"), "text/html; charset=utf-8");
}

export function createAppServer() {
  return createServer(appHandler);
}

if (isMainModule) {
  process.on("uncaughtException", (err) => {
    if (config.sentry.dsn) Sentry.captureException(err);
    console.error("[uncaughtException]", err);
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    if (config.sentry.dsn) Sentry.captureException(reason);
    console.error("[unhandledRejection]", reason);
  });

  if (!config.openai.apiKey && !config.forceLocalMode) {
    console.warn("[FATAL] OPENAI_API_KEY is not set — all AI calls will fail. Set the key or use AI_PRESALE_FORCE_LOCAL=1");
  }
  const server = createAppServer();
  server.listen(config.port, () => {
    console.log(`Franky-Presale server listening on http://localhost:${config.port}`);
    ensureUsersSeeded().catch((err) => console.warn("[seed] failed:", err.message));
    loadPersistedSessions().then(n => { if (n > 0) console.log(`[session] restored ${n} sessions`); }).catch((err) => console.warn("[session] restore failed:", err.message));
    checkKbCoverage().catch((err) => console.warn("[KB] coverage check failed:", err.message));
  });
}
