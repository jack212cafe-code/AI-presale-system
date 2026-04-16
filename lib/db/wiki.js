import { getSupabaseAdmin } from "./client.js";

export async function upsertWikiPage(page) {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase admin client not available");

  const { data, error } = await client
    .from("wiki_pages")
    .upsert(page, { onConflict: "product_name" })
    .select()
    .single();

  if (error) throw new Error(`Failed to upsert wiki page: ${error.message}`);
  return data;
}

export async function getWikiIndex() {
  const client = getSupabaseAdmin();
  if (!client) return [];

  const { data, error } = await client
    .from("wiki_pages")
    .select("product_name, vendor, category")
    .order("category")
    .order("product_name");

  if (error) throw new Error(`Failed to get wiki index: ${error.message}`);
  return data || [];
}

export async function getWikiPage(productName) {
  const client = getSupabaseAdmin();
  if (!client) return null;

  const { data, error } = await client
    .from("wiki_pages")
    .select("*")
    .eq("product_name", productName)
    .single();

  if (error) return null;
  return data;
}

export async function getWikiPagesByVendor(vendor) {
  const client = getSupabaseAdmin();
  if (!client) return [];

  const { data, error } = await client
    .from("wiki_pages")
    .select("product_name, vendor, category, overview, key_specs, positioning")
    .eq("vendor", vendor);

  if (error) throw new Error(`Failed to get wiki pages by vendor: ${error.message}`);
  return data || [];
}

export async function getWikiPagesByCategory(category) {
  const client = getSupabaseAdmin();
  if (!client) return [];

  const { data, error } = await client
    .from("wiki_pages")
    .select("product_name, vendor, category, overview, key_specs, positioning")
    .eq("category", category);

  if (error) throw new Error(`Failed to get wiki pages by category: ${error.message}`);
  return data || [];
}

export async function listWikiPages() {
  const client = getSupabaseAdmin();
  if (!client) return [];

  const { data, error } = await client
    .from("wiki_pages")
    .select("id, product_name, vendor, category, created_at, updated_at")
    .order("vendor")
    .order("product_name");

  if (error) throw new Error(`Failed to list wiki pages: ${error.message}`);
  return data || [];
}

export async function deleteWikiPage(id) {
  const client = getSupabaseAdmin();
  if (!client) return { deleted: 0 };

  const { error } = await client
    .from("wiki_pages")
    .delete()
    .eq("id", id);

  if (error) throw new Error(`Failed to delete wiki page: ${error.message}`);
  return { deleted: 1 };
}

export async function getWikiPagesForRequirements(requirements) {
  const client = getSupabaseAdmin();
  if (!client) return [];

  const vendors = requirements?.vendor_preferences?.preferred || [];
  const categories = [];

  const useCases = requirements?.use_cases || [];
  const catMap = { compute: "server", storage: "storage", network: "network", backup: "backup", security: "software" };
  for (const uc of useCases) {
    const lower = (uc || "").toLowerCase();
    for (const [keyword, cat] of Object.entries(catMap)) {
      if (lower.includes(keyword) && !categories.includes(cat)) categories.push(cat);
    }
  }

  let query = client.from("wiki_pages").select("product_name, vendor, category, overview, key_specs, positioning, tor_keywords");
  if (vendors.length > 0) query = query.in("vendor", vendors);
  if (categories.length > 0) query = query.in("category", categories);

  const { data, error } = await query;
  if (error) {
    console.error(`[wiki] query error: ${error.message}`);
    return [];
  }
  return data || [];
}