import { createClient } from "@supabase/supabase-js";

import { config, hasSupabaseAdmin, hasSupabasePublic } from "../config.js";

let adminClient;
let publicClient;
let _adminOverride;

export function __setSupabaseAdminForTest(client) {
  _adminOverride = client;
}

export function getSupabaseAdmin() {
  if (_adminOverride !== undefined) return _adminOverride;
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
