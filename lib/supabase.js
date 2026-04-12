import { createClient } from "@supabase/supabase-js";

import { config, hasSupabaseAdmin, hasSupabasePublic } from "./config.js";

let adminClient;
let publicClient;

export function getSupabaseAdmin() {
  if (!hasSupabaseAdmin()) {
    return null;
  }

  if (!adminClient) {
    try {
      adminClient = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
        auth: { persistSession: false }
      });
    } catch {
      return null;
    }
  }

  return adminClient;
}

export function getSupabasePublic() {
  if (!hasSupabasePublic()) {
    return null;
  }

  if (!publicClient) {
    try {
      publicClient = createClient(config.supabase.url, config.supabase.anonKey, {
        auth: { persistSession: false }
      });
    } catch {
      return null;
    }
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

export async function readAgentLogs(limit = 100) {
  const client = getSupabaseAdmin();
  if (!client) return [];

  const { data, error } = await client
    .from("agent_logs")
    .select("id, agent_name, model_used, tokens_used, cost_usd, duration_ms, status, project_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to read agent logs: ${error.message}`);
  return data ?? [];
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
    signal: AbortSignal.timeout(15_000),
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

// Retrieve chunks by filtering source_key for vendor name — more reliable than vector for specific product specs
export async function retrieveKnowledgeByVendorFilter(vendorNames, chunksPerVendor = 4) {
  const client = getSupabaseAdmin();
  if (!client || !vendorNames?.length) return [];

  // Map vendor display names to source_key keywords
  const VENDOR_FILE_KEYWORDS = {
    Dell: ["poweredge", "powerstore", "powervault", "powerprotect", "powerscale"],
    HPE: ["proliant", "simplivity", "nimble", "msa"],
    Nutanix: ["nutanix"],
    Veeam: ["veeam"],
    Proxmox: ["proxmox"],
    Cisco: ["cisco"],
    Fortinet: ["fortinet"],
    Commvault: ["commvault"]
  };

  // Two-step: find unique source files per keyword, then fetch N chunks per file
  const seenFiles = new Set();
  const sourceFiles = []; // ordered list of unique files to fetch

  for (const vendor of vendorNames) {
    const keywords = VENDOR_FILE_KEYWORDS[vendor] ?? [vendor.toLowerCase()];
    for (const kw of keywords) {
      const { data: fileRows } = await client.from("knowledge_base")
        .select("source_key")
        .ilike("source_key", `%${kw}%`)
        .not("content", "ilike", "-- % of %")
        .order("source_key", { ascending: true });
      if (!fileRows?.length) continue;

      for (const row of fileRows) {
        const f = row.source_key.split("#")[0];
        if (!seenFiles.has(f)) {
          seenFiles.add(f);
          sourceFiles.push(f);
        }
      }
    }
  }

  // Fetch N chunks from each unique source file
  const seen = new Set();
  const result = [];
  await Promise.all(sourceFiles.map(async (file) => {
    const { data } = await client.from("knowledge_base")
      .select("source_key, title, content, category, metadata")
      .ilike("source_key", `${file}%`)
      .not("content", "ilike", "-- % of %")
      .order("source_key", { ascending: true })
      .limit(chunksPerVendor);
    if (data?.length) {
      for (const c of data) {
        if (!seen.has(c.source_key)) {
          seen.add(c.source_key);
          result.push(c);
        }
      }
    }
  }));
  return result;
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
