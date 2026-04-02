import "dotenv/config";

const toNumber = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const toPositiveInt = (value, fallback) => {
  const numeric = Number.parseInt(value, 10);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
};

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
      discovery: process.env.OPENAI_MODEL_DISCOVERY || "gpt-5-mini",
      solution: process.env.OPENAI_MODEL_SOLUTION || "gpt-5-mini",
      bom: process.env.OPENAI_MODEL_BOM || "gpt-5-mini",
      proposal: process.env.OPENAI_MODEL_PROPOSAL || "gpt-5-mini"
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
  }
};

export function hasSupabaseAdmin() {
  if (config.forceLocalMode) {
    return false;
  }

  return Boolean(config.supabase.url && config.supabase.serviceRoleKey);
}

export function hasSupabasePublic() {
  if (config.forceLocalMode) {
    return false;
  }

  return Boolean(config.supabase.url && config.supabase.anonKey);
}

export function hasOpenAi() {
  if (config.forceLocalMode) {
    return false;
  }

  return Boolean(config.openai.apiKey);
}

export function hasEmbeddingConfig() {
  if (config.forceLocalMode) {
    return false;
  }

  if (config.embeddings.provider !== "openai") {
    return false;
  }

  return Boolean(config.embeddings.openAiApiKey);
}
