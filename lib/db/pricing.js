import { getSupabaseAdmin } from "./client.js";

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
