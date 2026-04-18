import { getSupabaseAdmin } from "./client.js";

export async function writeAgentLog(logEntry) {
  const client = getSupabaseAdmin();
  if (!client) {
    return { saved: false };
  }

  const { error } = await client.from("agent_logs").insert({
    project_id: logEntry.project_id ?? null,
    user_id: logEntry.user_id ?? null,
    org_id: logEntry.org_id ?? null,
    agent_name: logEntry.agent_name,
    model_used: logEntry.model_used ?? null,
    tokens_used: logEntry.tokens_used ?? 0,
    cost_usd: logEntry.cost_usd ?? 0,
    kb_chunks_injected: logEntry.kb_chunks_injected ?? 0,
    duration_ms: logEntry.duration_ms ?? 0,
    status: logEntry.status ?? "success",
    input_json: logEntry.input_json ?? null,
    output_json: logEntry.output_json ?? null
  });
  if (error) {
    throw new Error(`Failed to write agent log: ${error.message}`);
  }

  return { saved: true };
}

export async function getSessionTokenUsage(projectId) {
  const client = getSupabaseAdmin();
  if (!client || !projectId) return 0;
  const { data, error } = await client
    .from("agent_logs")
    .select("tokens_used")
    .eq("project_id", projectId);
  if (error || !data) return 0;
  return data.reduce((sum, row) => sum + (row.tokens_used ?? 0), 0);
}

export async function readAgentLogs(limit = 100, orgId = null) {
  const client = getSupabaseAdmin();
  if (!client) return [];

  let query = client
    .from("agent_logs")
    .select("id, agent_name, model_used, tokens_used, cost_usd, duration_ms, status, project_id, created_at, projects!inner(org_id)");
  if (orgId !== null) {
    query = query.eq("projects.org_id", orgId);
  }
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to read agent logs: ${error.message}`);
  return (data ?? []).map(({ projects, ...rest }) => rest);
}

export async function getUserMonthlyCost(userId) {
  const client = getSupabaseAdmin();
  if (!client || !userId) return 0;
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const { data, error } = await client
    .from("agent_logs")
    .select("cost_usd")
    .eq("user_id", userId)
    .gte("created_at", start.toISOString());
  if (error || !data) return 0;
  return data.reduce((sum, row) => sum + (row.cost_usd ?? 0), 0);
}
