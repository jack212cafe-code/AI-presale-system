import { randomUUID } from "node:crypto";

import { getSupabaseAdmin } from "./supabase.js";

export async function createProjectRecord(intake, userId) {
  const project = {
    customer_name: intake.customer_name,
    status: "intake",
    intake_json: intake,
    human_approved: false,
    user_id: userId
  };

  const client = getSupabaseAdmin();

  if (!client) {
    return {
      saved: false,
      warnings: ["Supabase admin credentials not configured; project not persisted."],
      project: {
        id: randomUUID(),
        ...project,
        created_at: new Date().toISOString()
      }
    };
  }

  const { data, error } = await client.from("projects").insert(project).select().single();
  if (error) {
    throw new Error(`Failed to create project record: ${error.message}`);
  }

  return {
    saved: true,
    warnings: [],
    project: data
  };
}

export async function persistBomJson(projectId, bomJson) {
  const client = getSupabaseAdmin();
  if (!client) {
    return { saved: false };
  }

  const { data, error } = await client
    .from("projects")
    .update({ bom_json: bomJson, status: "bom_complete", updated_at: new Date().toISOString() })
    .eq("id", projectId);

  if (error) {
    throw new Error(`Failed to persist BOM JSON: ${error.message}`);
  }

  return { saved: true, project: data?.[0] ?? null };
}

export async function persistRequirementsJson(projectId, requirementsJson) {
  const client = getSupabaseAdmin();
  if (!client) {
    return { saved: false };
  }

  const { data, error } = await client
    .from("projects")
    .update({
      requirements_json: requirementsJson,
      status: "discovery_complete",
      updated_at: new Date().toISOString()
    })
    .eq("id", projectId);

  if (error) {
    throw new Error(`Failed to persist requirements JSON: ${error.message}`);
  }

  const { data: project, error: selectError } = await client
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (selectError) {
    throw new Error(`Requirements JSON saved but project reload failed: ${selectError.message}`);
  }

  return { saved: true, project: project ?? data?.[0] ?? null };
}

export async function persistSolutionJson(projectId, solutionJson) {
  const client = getSupabaseAdmin();
  if (!client) {
    return { saved: false };
  }

  const { data, error } = await client
    .from("projects")
    .update({ solution_json: solutionJson, status: "solution_complete", updated_at: new Date().toISOString() })
    .eq("id", projectId);

  if (error) {
    throw new Error(`Failed to persist solution JSON: ${error.message}`);
  }

  return { saved: true, project: data?.[0] ?? null };
}

export async function getProjectById(projectId) {
  const client = getSupabaseAdmin();
  if (!client) {
    return null;
  }

  const { data, error } = await client.from("projects").select("*").eq("id", projectId).single();
  if (error) {
    throw new Error(`Failed to fetch project: ${error.message}`);
  }

  return data ?? null;
}

export async function listProjectsByUser(userId) {
  const client = getSupabaseAdmin();
  if (!client) {
    return [];
  }

  const { data, error } = await client
    .from("projects")
    .select("id, customer_name, status, proposal_url, created_at, updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list projects: ${error.message}`);
  }

  return data ?? [];
}

export async function approveProject(projectId) {
  const client = getSupabaseAdmin();
  if (!client) {
    return { saved: false };
  }

  const { error } = await client
    .from("projects")
    .update({ human_approved: true, updated_at: new Date().toISOString() })
    .eq("id", projectId);

  if (error) {
    throw new Error(`Failed to approve project: ${error.message}`);
  }

  return { saved: true };
}

export async function persistProposalMetadata(projectId, proposalPath) {
  const client = getSupabaseAdmin();
  if (!client) {
    return { saved: false };
  }

  const { data, error } = await client
    .from("projects")
    .update({
      proposal_url: proposalPath,
      status: "proposal_complete",
      human_approved: false,
      updated_at: new Date().toISOString()
    })
    .eq("id", projectId);

  if (error) {
    throw new Error(`Failed to persist proposal metadata: ${error.message}`);
  }

  return { saved: true, project: data?.[0] ?? null };
}
