import { runTorPipeline } from '../agents/tor.js';
import { generateTorComplianceCsv, getTorExportFilename } from '../lib/tor-export.js';
import { requireUserAuth, json, parseBody } from './helpers.js';
import { getSessionUserId, getSessionUser } from '../lib/user-auth.js';
import { requireRateLimit, requireRateLimitDb } from '../lib/rate-limit.js';
import { extractTextFromBuffer } from '../knowledge_base/raw-import-lib.js';

const torReports = new Map();
const TOR_REPORT_TTL_MS = 24 * 60 * 60 * 1000;
const PDF_SCAN_DETECT_MIN_CHARS = 100;
setInterval(() => {
  const cutoff = Date.now() - TOR_REPORT_TTL_MS;
  for (const [id, entry] of torReports) {
    if (entry.ts < cutoff) torReports.delete(id);
  }
}, 60 * 60 * 1000).unref();

export async function handle(request, url, response) {
  if (request.method === "POST" && url.pathname === "/api/tor/extract") {
    if (!requireUserAuth(request, response)) return true;
    try {
      const payload = await parseBody(request);
      const fileName = String(payload?.file_name || "").trim();
      const b64 = String(payload?.content_base64 || "").replace(/^data:[^;]+;base64,/, "");
      if (!fileName) return json(response, 400, { ok: false, error: "file_name is required" }), true;
      if (!b64) return json(response, 400, { ok: false, error: "content_base64 is required" }), true;

      const ext = (fileName.match(/\.[^.]+$/) || [""])[0].toLowerCase();
      const allowed = new Set([".pdf", ".docx", ".txt", ".md"]);
      if (!allowed.has(ext)) {
        return json(response, 400, { ok: false, error: `Unsupported file type: ${ext}. Allowed: ${[...allowed].join(", ")}` }), true;
      }

      const padding = (b64.match(/=+$/) || [""])[0].length;
      const approxBytes = Math.floor((b64.length * 3) / 4) - padding;
      const MAX = 15 * 1024 * 1024;
      if (approxBytes > MAX) {
        return json(response, 400, { ok: false, error: `File too large: ${(approxBytes / 1024 / 1024).toFixed(1)}MB exceeds 15MB limit` }), true;
      }

      const buffer = Buffer.from(b64, "base64");
      const text = await extractTextFromBuffer(buffer, ext);

      if (ext === ".pdf" && text.trim().length < PDF_SCAN_DETECT_MIN_CHARS) {
        return json(response, 200, { ok: true, text: "", warning: "PDF อาจเป็น scan image — ยังไม่รองรับ OCR ใน MVP. กรุณา paste ข้อความเอง" }), true;
      }

      return json(response, 200, { ok: true, text }), true;
    } catch (error) {
      console.error("[TOR extract] parse error:", error);
      return json(response, 400, { ok: false, error: "ไม่สามารถอ่านไฟล์ได้ กรุณาตรวจสอบไฟล์หรือ paste ข้อความเอง" }), true;
    }
  }

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
