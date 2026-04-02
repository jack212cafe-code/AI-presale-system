import "dotenv/config";
import { writeFile } from "node:fs/promises";

import { config, hasEmbeddingConfig } from "../lib/config.js";
import { upsertKnowledgeBase } from "../lib/supabase.js";
import { loadSeedEntries } from "./shared.js";

async function embedText(content) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.embeddings.openAiApiKey}`
    },
    body: JSON.stringify({
      model: config.embeddings.model,
      input: content
    })
  });

  if (!response.ok) {
    throw new Error(`Embedding request failed with status ${response.status}`);
  }

  const payload = await response.json();
  return payload.data?.[0]?.embedding ?? null;
}

const seedEntries = await loadSeedEntries();
const manifest = {
  generated_at: new Date().toISOString(),
  provider: hasEmbeddingConfig() ? config.embeddings.provider : "disabled",
  count: seedEntries.length,
  sources: seedEntries.map((entry) => entry.source_key)
};

await writeFile(
  new URL("./seed-manifest.json", import.meta.url),
  JSON.stringify(manifest, null, 2),
  "utf8"
);

if (!hasEmbeddingConfig()) {
  console.log(JSON.stringify({ ok: true, mode: "validate-only", manifest }, null, 2));
  process.exit(0);
}

const records = [];
for (const entry of seedEntries) {
  const embedding = await embedText(entry.content);
  records.push({
    source_key: entry.source_key,
    category: entry.metadata?.category || "general_reference",
    title: entry.title,
    content: entry.content,
    embedding,
    metadata: entry.metadata
  });
}

const result = await upsertKnowledgeBase(records);
console.log(JSON.stringify({ ok: true, mode: result.saved ? "upserted" : "embedded-only", count: records.length }, null, 2));
