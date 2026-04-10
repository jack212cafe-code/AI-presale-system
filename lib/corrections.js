import { getSupabaseAdmin } from "./supabase.js";
import { upsertKnowledgeBase } from "./supabase.js";

export async function saveCorrection({ projectId, field, wrongValue, correctValue, note = "" }) {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase not configured");

  const { error } = await client.from("corrections").insert({
    project_id: projectId ?? null,
    field,
    wrong_value: wrongValue,
    correct_value: correctValue,
    note
  });

  if (error) throw new Error(`Failed to save correction: ${error.message}`);
}

export async function listCorrections({ limit = 50 } = {}) {
  const client = getSupabaseAdmin();
  if (!client) return [];

  const { data, error } = await client
    .from("corrections")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to list corrections: ${error.message}`);
  return data ?? [];
}

/**
 * Aggregate corrections by field → upsert synthetic KB chunk.
 * Allows BOM/solution agents to learn from past human corrections.
 */
export async function aggregateCorrectionsToKb() {
  const client = getSupabaseAdmin();
  if (!client) return { count: 0 };

  const { data, error } = await client
    .from("corrections")
    .select("field, wrong_value, correct_value, note, created_at")
    .order("field")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch corrections: ${error.message}`);
  if (!data?.length) return { count: 0 };

  // Group by field
  const byField = new Map();
  for (const row of data) {
    if (!byField.has(row.field)) byField.set(row.field, []);
    byField.get(row.field).push(row);
  }

  const entries = [];
  for (const [field, rows] of byField) {
    const lines = rows.slice(0, 20).map(r =>
      `- Wrong: "${r.wrong_value}" → Correct: "${r.correct_value}"${r.note ? ` (${r.note})` : ""}`
    );
    entries.push({
      source_key: `corrections/${field}`,
      title: `Human Corrections — ${field}`,
      category: "corrections",
      content: `Field: ${field}\n\nKnown corrections from presale engineers:\n${lines.join("\n")}`,
      metadata: {
        field,
        correction_count: rows.length,
        last_updated: rows[0].created_at
      }
    });
  }

  const result = await upsertKnowledgeBase(entries);
  return { count: result.count };
}
