/**
 * Custom tool handlers — credentials stay here, never sent to the agent container.
 */

import { embedQuery } from "../lib/openai.js";
import { retrieveKnowledgeFromVector, getSupabaseAdmin } from "../lib/supabase.js";

// ── Session ID store (Supabase-backed, survives Railway deploys) ──────────────

export async function getSessionId(projectId) {
  const client = getSupabaseAdmin();
  const { data } = await client
    .from("projects")
    .select("intake_json")
    .eq("id", projectId)
    .single();
  return data?.intake_json?.managed_session_id ?? null;
}

export async function saveSessionId(projectId, sessionId) {
  const client = getSupabaseAdmin();
  const { data: row } = await client
    .from("projects")
    .select("intake_json")
    .eq("id", projectId)
    .single();
  await client
    .from("projects")
    .update({ intake_json: { ...(row?.intake_json ?? {}), managed_session_id: sessionId } })
    .eq("id", projectId);
}

// ── Tool dispatch ─────────────────────────────────────────────────────────────

export async function handleToolCall(toolName, input) {
  switch (toolName) {
    case "search_knowledge_base":
      return searchKnowledgeBase(input.query);
    case "save_project":
      return saveProject(input.project_id, input.stage, input.data);
    case "get_project":
      return getProject(input.project_id);
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ── Knowledge Base ────────────────────────────────────────────────────────────

async function searchKnowledgeBase(query) {
  try {
    const embedding = await embedQuery(query);
    const chunks = await retrieveKnowledgeFromVector(embedding, 5);
    return {
      chunks: chunks.map((c) => ({
        title: c.title ?? c.source_key,
        content: c.content,
        similarity: c.similarity,
      })),
    };
  } catch (err) {
    return { error: err.message, chunks: [] };
  }
}

// ── Project Persistence ───────────────────────────────────────────────────────

const STAGE_COLUMN = {
  requirements: "requirements_json",
  solution: "solution_json",
  bom: "bom_json",
};

const STAGE_STATUS = {
  requirements: "discovery_complete",
  solution: "solution_complete",
  bom: "bom_complete",
  proposal: "proposal_complete",
};

async function saveProject(projectId, stage, data) {
  const column = STAGE_COLUMN[stage];
  const client = getSupabaseAdmin();

  const update = {
    status: STAGE_STATUS[stage] ?? stage,
    updated_at: new Date().toISOString(),
  };

  // proposal has no dedicated column yet — store in intake_json.proposal_draft
  if (stage === "proposal") {
    const { data: row } = await client
      .from("projects")
      .select("intake_json")
      .eq("id", projectId)
      .single();
    update.intake_json = { ...(row?.intake_json ?? {}), proposal_draft: data };
  } else if (column) {
    update[column] = data;
  } else {
    return { error: `Unknown stage: ${stage}` };
  }

  const { error } = await client.from("projects").update(update).eq("id", projectId);
  if (error) return { error: error.message };
  return { ok: true, project_id: projectId, stage };
}

async function getProject(projectId) {
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from("projects")
    .select(
      "id, customer_name, status, intake_json, requirements_json, solution_json, bom_json, proposal_url",
    )
    .eq("id", projectId)
    .single();

  if (error) return { error: error.message };
  return data;
}
