import "dotenv/config";

const checks = [
  {
    key: "SUPABASE_URL",
    requiredFor: ["integrated runtime", "database access"]
  },
  {
    key: "SUPABASE_ANON_KEY",
    requiredFor: ["public Supabase access"]
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    requiredFor: ["admin database writes", "agent logs", "KB upsert"]
  },
  {
    key: "OPENAI_API_KEY",
    requiredFor: ["live discovery", "solution", "bom", "proposal generation", "live embedding generation"]
  },
  {
    key: "OPENAI_MODEL_DISCOVERY",
    requiredFor: ["discovery agent model"],
    optional: true
  },
  {
    key: "OPENAI_MODEL_SOLUTION",
    requiredFor: ["solution agent model"],
    optional: true
  },
  {
    key: "OPENAI_MODEL_BOM",
    requiredFor: ["bom agent model"],
    optional: true
  },
  {
    key: "OPENAI_MODEL_PROPOSAL",
    requiredFor: ["proposal agent model"],
    optional: true
  },
  {
    key: "OPENAI_EMBEDDING_MODEL",
    requiredFor: ["vector retrieval setup"],
    optional: true
  },
  {
    key: "N8N_REVIEW_WEBHOOK_URL",
    requiredFor: ["review callback integration"],
    optional: true
  }
];

const results = checks.map((check) => {
  const raw = process.env[check.key] ?? "";
  const present = raw.trim().length > 0;

  return {
    key: check.key,
    present,
    optional: Boolean(check.optional),
    requiredFor: check.requiredFor
  };
});

const missingRequired = results.filter((item) => !item.present && !item.optional);
const missingOptional = results.filter((item) => !item.present && item.optional);

const summary = {
  ok: missingRequired.length === 0,
  mode: missingRequired.length === 0 ? "ready-for-connectivity-checks" : "blocked-by-missing-secrets",
  missing_required: missingRequired.map((item) => item.key),
  missing_optional: missingOptional.map((item) => item.key),
  checks: results
};

console.log(JSON.stringify(summary, null, 2));

if (missingRequired.length > 0) {
  process.exitCode = 1;
}
