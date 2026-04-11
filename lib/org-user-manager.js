import { getSupabaseAdmin } from "./supabase.js";
import bcrypt from "bcryptjs";
import { logger } from "./logger.js";

export class OrgUserManager {
  /**
   * Invite a new user to the same organization as the admin
   * @param {string} adminUserId - ID of the admin performing the invite
   * @param {Object} userData - User details { username, password, displayName, role }
   * @returns {Promise<{user: Object}>}
   */
  async inviteUser(adminUserId, { username, password, displayName, role = "engineer" }) {
    const client = getSupabaseAdmin();
    if (!client) throw new Error("Supabase admin not configured");

    // 1. Get admin's org_id
    const { data: adminUser, error: adminError } = await client
      .from("users")
      .select("org_id")
      .eq("id", adminUserId)
      .single();

    if (adminError || !adminUser?.org_id) {
      throw new Error("Admin user not found or does not belong to an organization");
    }

    const orgId = adminUser.org_id;

    // 2. Check if username already exists
    const { data: existing } = await client
      .from("users")
      .select("id")
      .eq("username", username)
      .single();

    if (existing) {
      throw new Error(`Username '${username}' already exists`);
    }

    // 3. Hash password
    const password_hash = await bcrypt.hash(password, 12);

    // 4. Insert new user into the same org
    const { data: newUser, error: insertError } = await client
      .from("users")
      .insert({
        username,
        password_hash,
        display_name: displayName,
        role,
        org_id: orgId
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to invite user: ${insertError.message}`);
    }

    logger.info(`user.invited`, { username, orgId, invitedBy: adminUserId });
    return { user: newUser };
  }

  /**
   * List all members of a specific organization
   * @param {string} orgId
   * @returns {Promise<Array>}
   */
  async listOrgMembers(orgId) {
    const client = getSupabaseAdmin();
    if (!client) return [];

    const { data, error } = await client
      .from("users")
      .select("id, username, display_name, role, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to list org members: ${error.message}`);
    return data ?? [];
  }

  /**
   * Update user role within the organization
   * @param {string} targetUserId
   * @param {string} newRole - 'admin' | 'manager' | 'engineer'
   * @param {string} adminUserId - ID of the admin performing the update
   * @returns {Promise<{ok: boolean}>}
   */
  async updateMemberRole(targetUserId, newRole, adminUserId) {
    const client = getSupabaseAdmin();
    if (!client) throw new Error("Supabase admin not configured");

    // Verify admin can manage this user (must be in same org)
    const { data: admin } = await client.from("users").select("org_id").eq("id", adminUserId).single();
    const { data: target } = await client.from("users").select("org_id").eq("id", targetUserId).single();

    if (!admin || !target || admin.org_id !== target.org_id) {
      throw new Error("Unauthorized: You can only manage members of your own organization");
    }

    const { error } = await client
      .from("users")
      .update({ role: newRole })
      .eq("id", targetUserId);

    if (error) throw new Error(`Failed to update role: ${error.message}`);
    return { ok: true };
  }
}

export const orgUserManager = new OrgUserManager();
