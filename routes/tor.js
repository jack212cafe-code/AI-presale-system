import { runTorPipeline } from '../agents/tor.js';
import { generateTorComplianceCsv, getTorExportFilename } from '../lib/tor-export.js';
import { requireUserAuth, json, parseBody } from './helpers.js';
import { getSessionUserId, getSessionUser } from '../lib/user-auth.js';
import { requireRateLimit, requireRateLimitDb } from '../lib/rate-limit.js';

const torReports = new Map();
const TOR_REPORT_TTL_MS = 24 * 60 * 60 * 1000;
setInterval(() => {
  const cutoff = Date.now() - TOR_REPORT_TTL_MS;
  for (const [id, entry] of torReports) {
    if (entry.ts < cutoff) torReports.delete(id);
  }
}, 60 * 60 * 1000).unref();

export async function handle(request, url, response) {
  if (request.method === "POST" && url.pathname === "/api/tor") {
    if (!requireUserAuth(request, response)) return true;
    if (!(await requireRateLimitDb(request, response, getSessionUserId(request), "pipeline"))) return true;
    try {
      const payload = await parseBody(request);
      if (!payload.tor_text?.trim()) return json(response, 400, { ok: false, error: "tor_text is required" }), true;

      response.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no" });
      const sendEvent = (data) => response.write(`data: ${JSON.stringify(data)}\n\n`);

      const user = getSessionUser(request);
      const report = await runTorPipeline(payload.tor_text, {
        onProgress: (step, total, label) => sendEvent({ type: "progress", step, total, label }),
        orgId: user?.orgId ?? null
      });

      torReports.set(report.tor_id, { report, ts: Date.now() });
      sendEvent({ type: "done", ok: true, report });
      response.end();
    } catch (error) {
      try { response.write(`data: ${JSON.stringify({ type: "done", ok: false, error: error.message })}\n\n`); response.end(); } catch {}
    }
    return true;
  }

  if (request.method === "GET" && url.pathname.match(/^\/api\/tor\/[^/]+\/export$/)) {
    if (!requireUserAuth(request, response)) return true;
    const torId = url.pathname.split("/")[3];
    const entry = torReports.get(torId);
    if (!entry) { json(response, 404, { ok: false, error: "TOR report not found or expired" }); return true; }
    const report = entry.report;
    const csv = generateTorComplianceCsv(report);
    const filename = getTorExportFilename(report.project_name);
    response.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` });
    response.end(csv);
    return true;
  }

  return false;
}
