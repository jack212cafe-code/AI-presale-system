import { writeAgentLog } from "./supabase.js";

// Cost per 1M tokens (USD) — update when OpenAI changes pricing
const MODEL_COST = {
  "gpt-4o":          { input: 2.50,  output: 10.00 },
  "gpt-4o-mini":     { input: 0.15,  output: 0.60  },
  "gpt-4.1":         { input: 2.00,  output: 8.00  },
  "gpt-4.1-mini":    { input: 0.40,  output: 1.60  },
  "gpt-4.1-nano":    { input: 0.10,  output: 0.40  },
};

function calcCostUsd(model, inputTokens, outputTokens) {
  const key = Object.keys(MODEL_COST).find(k => (model ?? "").startsWith(k));
  if (!key) return 0;
  const rate = MODEL_COST[key];
  return (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output;
}

async function writeAgentLogSafely(entry) {
  void writeAgentLog(entry).catch((error) => {
    console.warn(`Agent log write skipped: ${error.message}`);
  });
}

export async function withAgentLogging({ agentName, projectId, modelUsed, input, kbChunksInjected }, runner) {
  const startedAt = Date.now();

  try {
    const result = await runner();
    const usage = result.usage ?? { input_tokens: 0, output_tokens: 0 };
    const inputTokens = usage.input_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? 0;
    const model = result.model ?? modelUsed;

    await writeAgentLogSafely({
      project_id: projectId ?? null,
      agent_name: agentName,
      model_used: model,
      tokens_used: inputTokens + outputTokens,
      cost_usd: calcCostUsd(model, inputTokens, outputTokens),
      kb_chunks_injected: kbChunksInjected ?? 0,
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
      cost_usd: 0,
      kb_chunks_injected: kbChunksInjected ?? 0,
      duration_ms: Date.now() - startedAt,
      status: "error",
      input_json: input,
      output_json: { error: error.message }
    });
    throw error;
  }
}
