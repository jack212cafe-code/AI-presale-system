import { getSupabaseAdmin } from "./supabase.js";
import { config } from "./config.js";

// Define SaaS Tiers and their quotas
export const SAAS_TIERS = {
  entry: {
    max_projects_per_month: 5,
    daily_token_limit: 100_000,
    rate_limit_multiplier: 1.0,
  },
  growth: {
    max_projects_per_month: 20,
    daily_token_limit: 1_000_000,
    rate_limit_multiplier: 2.0,
  },
  enterprise: {
    max_projects_per_month: null, // Unlimited
    daily_token_limit: 10_000_000,
    rate_limit_multiplier: 5.0,
  }
};

export class QuotaManager {
  /**
   * Check if a user has exceeded their project creation quota for the current month
   * @param {string} userId
   * @param {string} tier - 'entry' | 'growth' | 'enterprise'
   * @returns {Promise<{allowed: boolean, current: number, limit: number|null}>}
   */
  async checkProjectQuota(userId, tier = 'growth') {
    const quota = SAAS_TIERS[tier] || SAAS_TIERS.growth;
    const limit = quota.max_projects_per_month;

    if (limit === null) return { allowed: true, current: 0, limit: null };

    const client = getSupabaseAdmin();
    if (!client) return { allowed: true, current: 0, limit: null };

    const startOfMonth = new Date();
    startOfMonth.setDate(1, 0, 0, 0, 0);

    const { count, error } = await client
      .from("projects")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", startOfMonth.toISOString());

    if (error) throw new Error(`Quota check failed: ${error.message}`);

    return {
      allowed: (count || 0) < limit,
      current: count || 0,
      limit
    };
  }

  /**
   * Check if a user has exceeded their daily token quota
   * @param {string} userId
   * @param {string} tier - 'entry' | 'growth' | 'enterprise'
   * @returns {Promise<{allowed: boolean, current: number, limit: number}>}
   */
  async checkTokenQuota(userId, tier = 'growth') {
    const quota = SAAS_TIERS[tier] || SAAS_TIERS.growth;
    const limit = quota.daily_token_limit;

    const client = getSupabaseAdmin();
    if (!client) return { allowed: true, current: 0, limit };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error } = await client
      .from("agent_logs")
      .select("tokens_used")
      .eq("project_id", userId) // This logic needs a user_id in agent_logs
      .gte("created_at", today.toISOString());

    if (error) throw new Error(`Token quota check failed: ${error.message}`);

    const totalUsed = data.reduce((sum, row) => sum + (row.tokens_used || 0), 0);

    return {
      allowed: totalUsed < limit,
      current: totalUsed,
      limit
    };
  }
}

export const quotaManager = new QuotaManager();

export async function requireProjectQuota(response, userId, tier = "growth", role = null) {
  if (role === "admin" || role === "superadmin") return true;
  try {
    const result = await quotaManager.checkProjectQuota(userId, tier);
    if (result.allowed) return true;
    response.writeHead(429, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      ok: false,
      error: `Project quota exceeded — สร้างได้ ${result.limit} โปรเจกต์/เดือน (ใช้แล้ว ${result.current}). กรุณาอัพเกรดแพ็กเกจ`,
      quota_current: result.current,
      quota_limit: result.limit
    }));
    return false;
  } catch (err) {
    console.warn("[quota] checkProjectQuota error — allowing:", err.message);
    return true;
  }
}
