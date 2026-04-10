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
      updated_at: new Date().toISOString()
    })
    .eq("id", projectId);

  if (error) {
    throw new Error(`Failed to persist proposal metadata: ${error.message}`);
  }

  return { saved: true, project: data?.[0] ?? null };
}

export async function updateProjectName(projectId, name) {
  const client = getSupabaseAdmin();
  if (!client) return { saved: false };
  const { error } = await client
    .from("projects")
    .update({ customer_name: name, updated_at: new Date().toISOString() })
    .eq("id", projectId);
  if (error) throw new Error(`Failed to rename project: ${error.message}`);
  return { saved: true };
}

export async function listProjectsByCustomerName(userId, customerName) {
  const client = getSupabaseAdmin();
  if (!client) return [];
  const { data, error } = await client
    .from("projects")
    .select("id, customer_name, status, proposal_url, created_at")
    .eq("user_id", userId)
    .ilike("customer_name", `%${customerName}%`)
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) return [];
  return data ?? [];
}

export async function getRejectedOptionsByCustomer(userId, customerName) {
  const client = getSupabaseAdmin();
  if (!client) return [];
  const { data } = await client
    .from("projects")
    .select("solution_json")
    .eq("user_id", userId)
    .ilike("customer_name", `%${customerName}%`)
    .eq("status", "proposal_complete")
    .order("created_at", { ascending: false })
    .limit(3);
  if (!data) return [];
  const rejected = [];
  for (const row of data) {
    const sol = row.solution_json;
    if (!sol?.options) continue;
    const selected = sol.selected_option ?? -1;
    sol.options.forEach((opt, i) => {
      if (i !== selected) rejected.push({ name: opt.name, vendor_stack: opt.vendor_stack });
    });
  }
  return rejected;
}

/**
 * Record user feedback for a project.
 * @param {string} projectId
 * @param {string} userId
 * @param {number} rating - 1 for up, -1 for down
 * @returns {Promise<{saved: boolean}>}
 */
export async function recordProjectFeedback(projectId, userId, rating) {
  const client = getSupabaseAdmin();
  if (!client) return { saved: false };

  const { error } = await client.from("project_feedback").upsert({
    project_id: projectId,
    user_id: userId,
    rating: rating,
    created_at: new Date().toISOString()
  }, { onConflict: "project_id,user_id" });

  if (error) {
    console.error(`[projects] Failed to record feedback: ${error.message}`);
    return { saved: false };
  }

  return { saved: true };
}

/**
 * Retrieve aggregated feedback for admin dashboard.
 * @returns {Promise<Array>}
 */
export async function getAdminFeedbackSummary() {
  const client = getSupabaseAdmin();
  if (!client) return [];

  const { data, error } = await client
    .from("project_feedback")
    .select(`
      id,
      rating,
      created_at,
      projects (
        customer_name,
        project_name
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(`[projects] Failed to fetch feedback summary: ${error.message}`);
    return [];
  }

  return data ?? [];
}
