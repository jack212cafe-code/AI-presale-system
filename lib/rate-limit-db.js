import { getSupabaseAdmin } from "./supabase.js";

export async function checkLimitDb(key, max, windowMs) {
  const client = getSupabaseAdmin();
  if (!client) return null;

  const now = Date.now();
  const { data, error } = await client.rpc("rate_limit_increment", {
    p_key: key,
    p_max: max,
    p_window_ms: windowMs,
    p_now: now
  });

  if (error) {
    console.warn("[rate-limit-db] rpc error — falling back to allow:", error.message);
    return null;
  }

  const { count, window_start } = data;
  if (count > max) {
    const retryAfterSec = Math.ceil((window_start + windowMs - now) / 1000);
    return { allowed: false, retryAfterSec };
  }
  return { allowed: true };
}
