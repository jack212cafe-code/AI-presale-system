import { getSupabaseAdmin } from '../lib/supabase.js';
import { config } from '../lib/config.js';
import { json } from './helpers.js';

export async function handle(request, url, response) {
  if (request.method !== "GET" || url.pathname !== "/health") return false;

  const PROBE_TIMEOUT_MS = 3000;
  const probeTimeout = (promise) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), PROBE_TIMEOUT_MS))
  ]);

  const checks = {};
  const supabase = getSupabaseAdmin();
  if (supabase) {
    checks.supabase = await probeTimeout(
      supabase.from("sessions").select("token").limit(1).then(({ error }) => error ? { ok: false, error: error.message } : { ok: true })
    ).catch(err => ({ ok: false, error: err.message }));
  } else {
    checks.supabase = { ok: true, note: "local mode" };
  }

  if (config.openai.apiKey) {
    checks.openai = await probeTimeout(
      fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${config.openai.apiKey}` }
      }).then(r => r.ok ? { ok: true } : { ok: false, error: `HTTP ${r.status}` })
    ).catch(err => ({ ok: false, error: err.message }));
  } else {
    checks.openai = { ok: false, error: "no API key" };
  }

  const allOk = Object.values(checks).every(c => c.ok);
  json(response, allOk ? 200 : 503, {
    status: allOk ? "ok" : "degraded",
    mode: supabase ? "integrated" : "local",
    checks,
    timestamp: new Date().toISOString()
  });
  return true;
}
