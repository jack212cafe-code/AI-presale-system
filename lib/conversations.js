import { randomUUID } from "node:crypto";

import { getSupabaseAdmin } from "./supabase.js";

export async function createConversation(projectId, userId, orgId = null) {
  const client = getSupabaseAdmin();

  if (!client) {
    return {
      saved: false,
      conversation: {
        id: randomUUID(),
        project_id: projectId,
        user_id: userId,
        org_id: orgId,
        stage: "greeting",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    };
  }

  const { data, error } = await client
    .from("conversations")
    .insert({ project_id: projectId, user_id: userId, org_id: orgId, stage: "greeting" })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create conversation: ${error.message}`);
  }

  return { saved: true, conversation: data };
}

export async function getConversationById(conversationId, orgId = null) {
  const client = getSupabaseAdmin();

  if (!client) {
    return null;
  }

  if (orgId !== null) {
    const { data, error } = await client
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("org_id", orgId)
      .single();
    if (error || !data) return null;
    return data;
  }

  const { data, error } = await client
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .single();

  if (error) {
    throw new Error(`Failed to get conversation: ${error.message}`);
  }

  return data ?? null;
}

export async function getConversationsByProject(projectId, orgId = null) {
  const client = getSupabaseAdmin();

  if (!client) {
    return [];
  }

  let query = client
    .from("conversations")
    .select("id, project_id, stage, created_at, updated_at")
    .eq("project_id", projectId);

  if (orgId !== null) {
    query = query.eq("org_id", orgId);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list conversations: ${error.message}`);
  }

  return data ?? [];
}

export async function updateConversationStage(conversationId, stage) {
  const client = getSupabaseAdmin();

  if (!client) {
    return { saved: false };
  }

  const { error } = await client
    .from("conversations")
    .update({ stage, updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  if (error) {
    throw new Error(`Failed to update conversation stage: ${error.message}`);
  }

  return { saved: true };
}

export async function addMessage(conversationId, role, content) {
  const client = getSupabaseAdmin();

  if (!client) {
    return {
      saved: false,
      message: {
        id: randomUUID(),
        conversation_id: conversationId,
        role,
        content,
        created_at: new Date().toISOString()
      }
    };
  }

  const { data, error } = await client
    .from("messages")
    .insert({ conversation_id: conversationId, role, content })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to add message: ${error.message}`);
  }

  return { saved: true, message: data };
}

export async function getMessagesByConversation(conversationId, orgId = null) {
  const client = getSupabaseAdmin();

  if (!client) {
    return [];
  }

  if (orgId !== null) {
    const { data: conv } = await client
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (!conv) return [];
  }

  const { data, error } = await client
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to get messages: ${error.message}`);
  }

  return data ?? [];
}
