import "dotenv/config";

const toNumber = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const toPositiveInt = (value, fallback) => {
  const numeric = Number.parseInt(value, 10);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
};

const MODEL_PREMIUM = "gpt-4.1-mini";
const MODEL_STANDARD = "gpt-4.1-mini";

export const config = {
  port: toNumber(process.env.PORT, 3000),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || "http://localhost:3000",
  forceLocalMode: process.env.AI_PRESALE_FORCE_LOCAL === "1",
  supabase: {
    url: process.env.SUPABASE_URL || "",
    anonKey: process.env.SUPABASE_ANON_KEY || "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    models: {
      discovery: process.env.OPENAI_MODEL_DISCOVERY || MODEL_STANDARD,
      specialist: process.env.OPENAI_MODEL_SPECIALIST || MODEL_STANDARD,
      solution: process.env.OPENAI_MODEL_SOLUTION || MODEL_PREMIUM,
      bom: process.env.OPENAI_MODEL_BOM || MODEL_PREMIUM,
      proposal: process.env.OPENAI_MODEL_PROPOSAL || MODEL_STANDARD
    }
  },
  embeddings: {
    provider: process.env.EMBEDDING_PROVIDER || "openai",
    openAiApiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small"
  },
  knowledgeImport: {
    maxFileSizeMb: toPositiveInt(process.env.KB_IMPORT_MAX_FILE_SIZE_MB, 30),
    maxChunksPerDocument: toPositiveInt(process.env.KB_IMPORT_MAX_CHUNKS_PER_DOCUMENT, 400),
    embeddingBatchSize: toPositiveInt(process.env.KB_IMPORT_EMBED_BATCH_SIZE, 20),
    upsertBatchSize: toPositiveInt(process.env.KB_IMPORT_UPSERT_BATCH_SIZE, 100)
  },
  admin: {
    password: process.env.ADMIN_PORTAL_PASSWORD || ""
  },
  n8n: {
    reviewWebhookUrl: process.env.N8N_REVIEW_WEBHOOK_URL || ""
  },
  rateLimit: {
    api: {
      max: toPositiveInt(process.env.RATE_LIMIT_API_MAX, 30),
      windowMs: toPositiveInt(process.env.RATE_LIMIT_API_WINDOW_MIN, 1) * 60_000
    },
    pipeline: {
      max: toPositiveInt(process.env.RATE_LIMIT_PIPELINE_MAX, 10),
      windowMs: toPositiveInt(process.env.RATE_LIMIT_PIPELINE_WINDOW_MIN, 60) * 60_000
    }
  }
};

export function hasSupabaseAdmin() {
  if (config.forceLocalMode) return false;
  return Boolean(config.supabase.url && config.supabase.serviceRoleKey);
}

export function hasSupabasePublic() {
  if (config.forceLocalMode) return false;
  return Boolean(config.supabase.url && config.supabase.anonKey);
}

export function hasOpenAi() {
  if (config.forceLocalMode) return false;
  return Boolean(config.openai.apiKey);
}

export function hasEmbeddingConfig() {
  if (config.forceLocalMode) return false;
  if (config.embeddings.provider !== "openai") return false;
  return Boolean(config.embeddings.openAiApiKey);
}
