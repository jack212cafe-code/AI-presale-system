import { writeAgentLog } from "./supabase.js";

async function writeAgentLogSafely(entry) {
  try {
    await writeAgentLog(entry);
  } catch (error) {
    console.warn(`Agent log write skipped: ${error.message}`);
  }
}

export async function withAgentLogging({ agentName, projectId, modelUsed, input }, runner) {
  const startedAt = Date.now();

  try {
    const result = await runner();
    const usage = result.usage ?? { input_tokens: 0, output_tokens: 0 };

    await writeAgentLogSafely({
      project_id: projectId ?? null,
      agent_name: agentName,
      model_used: result.model ?? modelUsed,
      tokens_used: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
      duration_ms: Date.now() - startedAt,
      status: "success",
      input_json: input,
      output_json: result.output
    });

    return result.output;
  } catch (error) {
    await writeAgentLogSafely({
      project_id: projectId ?? null,
      agent_name: agentName,
      model_used: modelUsed,
      tokens_used: 0,
      duration_ms: Date.now() - startedAt,
      status: "error",
      input_json: input,
      output_json: { error: error.message }
    });
    throw error;
  }
}
