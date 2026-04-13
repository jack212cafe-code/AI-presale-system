import { getSupabaseAdmin } from "./client.js";

export async function writeAgentLog(logEntry) {
  const client = getSupabaseAdmin();
  if (!client) {
    return { saved: false };
  }

  const { error } = await client.from("agent_logs").insert(logEntry);
  if (error) {
    throw new Error(`Failed to write agent log: ${error.message}`);
  }

  return { saved: true };
}

export async function readAgentLogs(limit = 100) {
  const client = getSupabaseAdmin();
  if (!client) return [];

  const { data, error } = await client
    .from("agent_logs")
    .select("id, agent_name, model_used, tokens_used, cost_usd, duration_ms, status, project_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to read agent logs: ${error.message}`);
  return data ?? [];
}
