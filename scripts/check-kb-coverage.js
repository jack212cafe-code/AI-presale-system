#!/usr/bin/env node
// KB Coverage Check — verify each vendor has ≥1 spec sheet chunk in knowledge_base
// Usage: node scripts/check-kb-coverage.js
import "dotenv/config";
import { getSupabaseAdmin } from "../lib/supabase.js";

const REQUIRED_VENDORS = [
  { vendor: "Dell",     keywords: ["poweredge", "powerstore", "powervault", "powerprotect", "powerscale"] },
  { vendor: "HPE",      keywords: ["proliant", "simplivity", "nimble"] },
  { vendor: "Veeam",   keywords: ["veeam"] },
  { vendor: "Proxmox", keywords: ["proxmox"] },
];

export async function checkKbCoverage({ warn = true } = {}) {
  const client = getSupabaseAdmin();
  if (!client) {
    if (warn) console.warn("[KB] Supabase not configured — skipping KB coverage check");
    return { ok: true, missing: [] };
  }

  const missing = [];

  for (const { vendor, keywords } of REQUIRED_VENDORS) {
    let found = false;
    for (const kw of keywords) {
      const { data } = await client
        .from("knowledge_base")
        .select("source_key")
        .ilike("source_key", `%${kw}%`)
        .limit(1);
      if (data?.length) { found = true; break; }
    }
    if (!found) missing.push(vendor);
  }

  if (missing.length > 0 && warn) {
    console.warn(`[KB] Missing vendor spec sheets: ${missing.join(", ")} — BOM hallucination risk HIGH`);
  }

  return { ok: missing.length === 0, missing };
}

// Run directly
if (process.argv[1]?.endsWith("check-kb-coverage.js")) {
  checkKbCoverage().then(({ ok, missing }) => {
    if (ok) {
      console.log("[KB] All vendors have spec sheets in knowledge base.");
    } else {
      console.warn(`[KB] Missing: ${missing.join(", ")}`);
      process.exit(1);
    }
  });
}
