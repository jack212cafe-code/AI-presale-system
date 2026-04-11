import { getSupabaseAdmin } from "./supabase.js";
import { MODEL_COST } from "./logging.js";

export class CostCalculator {
  /**
   * Calculate total cost for a specific project based on agent logs
   * @param {string} projectId
   * @returns {Promise<{totalCostUsd: number, totalTokens: number, details: Array}>}
   */
  async calculateProjectCost(projectId) {
    const client = getSupabaseAdmin();
    if (!client) throw new Error("Supabase admin not configured");

    const { data: logs, error } = await client
      .from("agent_logs")
      .select("agent_name, model_used, tokens_used, cost_usd")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(`Failed to fetch logs: ${error.message}`);

    let totalCostUsd = 0;
    let totalTokens = 0;

    const details = logs.map(log => {
      totalCostUsd += log.cost_usd || 0;
      totalTokens += log.tokens_used || 0;
      return {
        agent: log.agent_name,
        model: log.model_used,
        tokens: log.tokens_used,
        cost: log.cost_usd
      };
    });

    return {
      totalCostUsd,
      totalTokens,
      details
    };
  }

  /**
   * Simulate pricing for a SaaS subscription based on usage
   * @param {number} actualCostUsd - The real cost from OpenAI
   * @param {string} tier - 'entry' | 'growth' | 'enterprise'
   * @returns {Object} Simulation result
   */
  simulateSaaSPrice(actualCostUsd, tier = 'growth') {
    const MARGINS = {
      entry: 1.5,     // 50% margin
      growth: 2.0,    // 100% margin
      enterprise: 3.0 // 200% margin
    };

    const multiplier = MARGINS[tier] || MARGINS.growth;
    const suggestedPrice = actualCostUsd * multiplier;

    return {
      actualCostUsd,
      suggestedPrice,
      margin: (multiplier - 1) * 100,
      tier
    };
  }
}

export const costCalculator = new CostCalculator();
