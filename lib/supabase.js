import { createClient } from "@supabase/supabase-js";

import { config, hasSupabaseAdmin, hasSupabasePublic } from "./config.js";

let adminClient;
let publicClient;

export function getSupabaseAdmin() {
  if (!hasSupabaseAdmin()) {
    return null;
  }

  if (!adminClient) {
    adminClient = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { persistSession: false }
    });
  }

  return adminClient;
}

export function getSupabasePublic() {
  if (!hasSupabasePublic()) {
    return null;
  }

  if (!publicClient) {
    publicClient = createClient(config.supabase.url, config.supabase.anonKey, {
      auth: { persistSession: false }
    });
  }

  return publicClient;
}

export async function writeAgentLog(logEntry) {
  const client = getSupabaseAdmin();
  if (!client) {
    return { saved: false };
  }

  const { error } = await client.from("agent_logs").insert(logEntry);
  if (error) {
    throw new Error(`Failed to write agent log: ${error.message}`);
  }

  return { saved: true };
}

export async function upsertKnowledgeBase(entries) {
  const client = getSupabaseAdmin();
  if (!client) {
    return { saved: false, count: 0 };
  }

  const { error, data } = await client
    .from("knowledge_base")
    .upsert(entries, { onConflict: "source_key" })
    .select("id");

  if (error) {
    throw new Error(`Failed to upsert knowledge base entries: ${error.message}`);
  }

  return { saved: true, count: data.length };
}

export async function listKnowledgeDocuments() {
  const client = getSupabaseAdmin();
  if (!client) {
    return [];
  }

  const { data, error } = await client
    .from("knowledge_base")
    .select("source_key,title,category,metadata,created_at")
    .like("source_key", "raw/%")
    .order("source_key", { ascending: true });

  if (error) {
    throw new Error(`Failed to list knowledge documents: ${error.message}`);
  }

  const grouped = new Map();

  for (const row of data ?? []) {
    const sourceFile = row.metadata?.source_file;
    if (!sourceFile) {
      continue;
    }

    if (!grouped.has(sourceFile)) {
      grouped.set(sourceFile, {
        source_file: sourceFile,
        title: row.metadata?.title || row.title,
        vendor: row.metadata?.vendor || null,
        product_family: row.metadata?.product_family || null,
        document_type: row.metadata?.document_type || null,
        category: row.category,
        revision_date: row.metadata?.revision_date || null,
        chunk_count: 0,
        created_at: row.created_at,
        tags: row.metadata?.tags || []
      });
    }

    const document = grouped.get(sourceFile);
    document.chunk_count += 1;
    if (!document.created_at || row.created_at < document.created_at) {
      document.created_at = row.created_at;
    }
  }

  return Array.from(grouped.values()).sort((left, right) => left.source_file.localeCompare(right.source_file));
}

export async function deleteKnowledgeDocumentBySourceFile(sourceFile) {
  const client = getSupabaseAdmin();
  if (!client) {
    return { deleted: 0 };
  }

  const { data: rows, error: selectError } = await client
    .from("knowledge_base")
    .select("source_key")
    .like("source_key", `raw/${sourceFile}#%`);

  if (selectError) {
    throw new Error(`Failed to find knowledge rows: ${selectError.message}`);
  }

  if (!rows || rows.length === 0) {
    return { deleted: 0 };
  }

  const sourceKeys = rows.map((row) => row.source_key);
  const { error: deleteError } = await client
    .from("knowledge_base")
    .delete()
    .in("source_key", sourceKeys);

  if (deleteError) {
    throw new Error(`Failed to delete knowledge rows: ${deleteError.message}`);
  }

  return { deleted: sourceKeys.length };
}

export async function retrieveKnowledgeFromVector(queryEmbedding, matchCount = 5) {
  if (!hasSupabaseAdmin()) {
    return [];
  }

  const normalizedEmbedding = Array.isArray(queryEmbedding) ? `[${queryEmbedding.join(",")}]` : queryEmbedding;
  const response = await fetch(`${config.supabase.url}/rest/v1/rpc/match_knowledge_base`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.supabase.serviceRoleKey,
      Authorization: `Bearer ${config.supabase.serviceRoleKey}`
    },
    body: JSON.stringify({
      query_embedding: normalizedEmbedding,
      match_count: matchCount
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Knowledge base retrieval failed: ${JSON.stringify(payload)}`);
  }

  if (Array.isArray(payload) && payload.length > 0) {
    return payload;
  }

  const kbResponse = await fetch(
    `${config.supabase.url}/rest/v1/knowledge_base?select=id,source_key,category,title,content,metadata,embedding&embedding=not.is.null`,
    {
      headers: {
        apikey: config.supabase.serviceRoleKey,
        Authorization: `Bearer ${config.supabase.serviceRoleKey}`
      }
    }
  );

  const kbPayload = await kbResponse.json();
  if (!kbResponse.ok) {
    throw new Error(`Knowledge base fallback retrieval failed: ${JSON.stringify(kbPayload)}`);
  }

  const queryVector = Array.isArray(queryEmbedding) ? queryEmbedding : parseVectorString(queryEmbedding);
  return (kbPayload ?? [])
    .map((row) => ({
      ...row,
      similarity: cosineSimilarity(queryVector, parseVectorString(row.embedding))
    }))
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, matchCount);
}

function parseVectorString(value) {
  if (Array.isArray(value)) {
    return value.map(Number);
  }

  if (typeof value !== "string") {
    return [];
  }

  return value
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));
}

function cosineSimilarity(left, right) {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return -1;
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return -1;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

export async function getPricingRowsByVendors(vendors) {
  const client = getSupabaseAdmin();
  if (!client || vendors.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from("pricing_catalog")
    .select("*")
    .in("vendor", vendors);

  if (error) {
    throw new Error(`Pricing lookup failed: ${error.message}`);
  }

  return data ?? [];
}
