import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveFile, requireUserAuth } from './helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

export async function handle(request, url, response) {
  if (request.method !== "GET") return false;

  switch (url.pathname) {
    case "/":
      serveFile(response, path.join(ROOT, "login", "login.html"), "text/html; charset=utf-8");
      return true;
    case "/admin":
      serveFile(response, path.join(ROOT, "admin", "index.html"), "text/html; charset=utf-8");
      return true;
    case "/intake/submit.js":
      serveFile(response, path.join(ROOT, "intake", "submit.js"), "application/javascript; charset=utf-8");
      return true;
    case "/admin/admin.js":
      serveFile(response, path.join(ROOT, "admin", "admin.js"), "application/javascript; charset=utf-8");
      return true;
    case "/chat":
      serveFile(response, path.join(ROOT, "chat", "chat.html"), "text/html; charset=utf-8");
      return true;
    case "/login":
      serveFile(response, path.join(ROOT, "login", "login.html"), "text/html; charset=utf-8");
      return true;
    case "/chat/chat.js":
      serveFile(response, path.join(ROOT, "chat", "chat.js"), "application/javascript; charset=utf-8");
      return true;
    case "/login/login.js":
      serveFile(response, path.join(ROOT, "login", "login.js"), "application/javascript; charset=utf-8");
      return true;
    case "/pipeline":
      if (!requireUserAuth(request, response)) return true;
      serveFile(response, path.join(ROOT, "pipeline", "pipeline.html"), "text/html; charset=utf-8");
      return true;
    case "/pipeline/pipeline.js":
      serveFile(response, path.join(ROOT, "pipeline", "pipeline.js"), "application/javascript; charset=utf-8");
      return true;
  }

  return false;
}
