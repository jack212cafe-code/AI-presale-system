import "dotenv/config";

import { hasEmbeddingConfig, hasSupabaseAdmin } from "../lib/config.js";
import { retrieveKnowledgeFromVector } from "../lib/supabase.js";
import { retrieveLocalKnowledge } from "../knowledge_base/shared.js";

const scenarios = [
  {
    name: "HCI",
    query: "Need HCI sizing guidance for enterprise virtualization cluster with growth headroom",
    expectedSources: ["seed/hci-sizing.md", "seed/hci-expansion-planning.md"]
  },
  {
    name: "Backup",
    query: "Need backup design with immutability retention and ransomware recovery controls",
    expectedSources: ["seed/backup-retention.md", "seed/backup-immutability.md"]
  },
  {
    name: "DR",
    query: "Need disaster recovery design with warm site workload dependency mapping and recovery targets",
    expectedSources: ["seed/dr-tier-mapping.md", "seed/dr-workload-tiering.md"]
  }
];

async function embedForQuery(query) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
      input: query
    })
  });

  if (!response.ok) {
    throw new Error(`Embedding request failed with status ${response.status}`);
  }

  const payload = await response.json();
  return payload.data?.[0]?.embedding ?? [];
}

async function retrieve(query) {
  if (hasSupabaseAdmin() && hasEmbeddingConfig()) {
    const embedding = await embedForQuery(query);
    return retrieveKnowledgeFromVector(embedding, 5);
  }

  return retrieveLocalKnowledge(query, 5);
}

function evaluateScenario(result, expectedSources) {
  const actualSources = result.map((entry) => entry.source_key);
  const matchedSources = expectedSources.filter((source) => actualSources.includes(source));

  return {
    expected_sources: expectedSources,
    actual_sources: actualSources,
    matched_sources: matchedSources,
    passed: matchedSources.length > 0
  };
}

const summary = [];

for (const scenario of scenarios) {
  const matches = await retrieve(scenario.query);
  summary.push({
    scenario: scenario.name,
    query: scenario.query,
    mode: hasSupabaseAdmin() && hasEmbeddingConfig() ? "remote-vector" : "local-keyword",
    ...evaluateScenario(matches, scenario.expectedSources),
    top_matches: matches.map((entry) => ({
      source_key: entry.source_key,
      title: entry.title,
      category: entry.category ?? entry.metadata?.category ?? null,
      similarity: entry.similarity ?? null
    }))
  });
}

const failed = summary.filter((item) => !item.passed);

console.log(
  JSON.stringify(
    {
      ok: failed.length === 0,
      checked_at: new Date().toISOString(),
      scenarios: summary
    },
    null,
    2
  )
);

if (failed.length > 0) {
  process.exitCode = 1;
}
