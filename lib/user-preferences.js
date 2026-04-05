import { getSupabaseAdmin } from "./supabase.js";

export async function getVendorPreferences(userId) {
  const client = getSupabaseAdmin();
  if (!client) return { preferred: [], disliked: [] };
  const { data } = await client
    .from("user_preferences")
    .select("vendor_preferences")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.vendor_preferences ?? { preferred: [], disliked: [] };
}

export async function upsertVendorPreference(userId, vendor, sentiment) {
  const prefs = await getVendorPreferences(userId);
  const opposite = sentiment === "preferred" ? "disliked" : "preferred";
  prefs[opposite] = prefs[opposite].filter(v => v !== vendor);
  if (!prefs[sentiment].includes(vendor)) prefs[sentiment].push(vendor);
  const client = getSupabaseAdmin();
  if (!client) return { saved: false };
  const { error } = await client
    .from("user_preferences")
    .upsert(
      { user_id: userId, vendor_preferences: prefs, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  if (error) throw new Error(`Failed to save preference: ${error.message}`);
  return { saved: true };
}
