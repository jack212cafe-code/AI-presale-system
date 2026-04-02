import "dotenv/config";
import { getSupabaseAdmin } from "../lib/supabase.js";

const rows = [
  // Nutanix
  { vendor: "Nutanix", part_number: "NX-HCI-BASE", description: "Nutanix HCI base node (AOS + AHV, 2U, 2x CPU, 512GB RAM, 12TB NVMe)", unit_price: 420000, currency: "THB" },
  { vendor: "Nutanix", part_number: "NX-HCI-STORAGE", description: "Nutanix storage-heavy node (large capacity, 2U, 6x 8TB HDD + 2x NVMe cache)", unit_price: 380000, currency: "THB" },
  { vendor: "Nutanix", part_number: "NX-SW-ONLY", description: "Nutanix AOS + AHV software-only license (per node, BYO hardware)", unit_price: 95000, currency: "THB" },
  { vendor: "Nutanix", part_number: "NX-NC2-CLOUD", description: "Nutanix Cloud Clusters (NC2) on Azure/AWS — annual subscription per node", unit_price: 210000, currency: "THB" },
  { vendor: "Nutanix", part_number: "NX-DR-REPLICATION", description: "Nutanix Leap DR replication license (per node, remote site)", unit_price: 55000, currency: "THB" },

  // Veeam
  { vendor: "Veeam", part_number: "VEEAM-STD", description: "Veeam Backup & Replication Standard (per socket)", unit_price: 75000, currency: "THB" },
  { vendor: "Veeam", part_number: "VEEAM-ENT", description: "Veeam Backup & Replication Enterprise (per socket)", unit_price: 180000, currency: "THB" },
  { vendor: "Veeam", part_number: "VEEAM-ENT-PLUS", description: "Veeam Backup & Replication Enterprise Plus (per socket, includes Veeam ONE)", unit_price: 260000, currency: "THB" },
  { vendor: "Veeam", part_number: "VEEAM-M365", description: "Veeam Backup for Microsoft 365 (per user/year)", unit_price: 850, currency: "THB" },
  { vendor: "Veeam", part_number: "VEEAM-IMMUTABLE", description: "Veeam hardened Linux repository setup (professional services)", unit_price: 45000, currency: "THB" },

  // Dell Technologies
  { vendor: "Dell", part_number: "DELL-R750XS", description: "Dell PowerEdge R750xs (2U, 2x Xeon Gold, 512GB RAM, 10x 2.4TB SAS)", unit_price: 420000, currency: "THB" },
  { vendor: "Dell", part_number: "DELL-3TIER", description: "Dell compute/storage 3-tier bundle (R750 + ME5 storage, rack + switches)", unit_price: 510000, currency: "THB" },
  { vendor: "Dell", part_number: "DELL-ME5-SAN", description: "Dell PowerStore ME5 midrange SAN (24x 2.4TB SAS, 2x controllers)", unit_price: 680000, currency: "THB" },
  { vendor: "Dell", part_number: "DELL-VXR-4N", description: "Dell VxRail 4-node HCI cluster (VMware-integrated, all-flash NVMe)", unit_price: 1800000, currency: "THB" },

  // Cisco
  { vendor: "Cisco", part_number: "CISCO-C9300-48P", description: "Cisco Catalyst 9300 48-port PoE+ switch (Layer 3, IOS-XE)", unit_price: 185000, currency: "THB" },
  { vendor: "Cisco", part_number: "CISCO-ASR1001", description: "Cisco ASR1001-X WAN aggregation router (10G, SD-WAN ready)", unit_price: 320000, currency: "THB" },
  { vendor: "Cisco", part_number: "CISCO-HX-4N", description: "Cisco HyperFlex 4-node cluster (Intersight-managed, NVMe all-flash)", unit_price: 2100000, currency: "THB" },
  { vendor: "Cisco", part_number: "CISCO-FPR2130", description: "Cisco Firepower 2130 NGFW (10G, Threat Defense, HA pair)", unit_price: 480000, currency: "THB" },

  // Fortinet
  { vendor: "Fortinet", part_number: "FG-200F", description: "Fortinet FortiGate 200F NGFW (10G, SD-WAN, UTM bundle 1 year)", unit_price: 260000, currency: "THB" },
  { vendor: "Fortinet", part_number: "FG-600F", description: "Fortinet FortiGate 600F enterprise NGFW (25G, HA ready, UTM bundle 1 year)", unit_price: 520000, currency: "THB" },
  { vendor: "Fortinet", part_number: "FAZ-300G", description: "Fortinet FortiAnalyzer 300G (log management, SOC analytics, 5TB storage)", unit_price: 185000, currency: "THB" },
  { vendor: "Fortinet", part_number: "FMG-300G", description: "Fortinet FortiManager 300G (centralized policy management, up to 100 devices)", unit_price: 175000, currency: "THB" },

  // HPE
  { vendor: "HPE", part_number: "HPE-DL380-G11", description: "HPE ProLiant DL380 Gen11 (2U, 2x Xeon Platinum, 512GB RAM, 12x NVMe)", unit_price: 445000, currency: "THB" },
  { vendor: "HPE", part_number: "HPE-SIMPLIVITY-4N", description: "HPE SimpliVity 4-node HCI (all-flash, built-in backup dedup, Omnistack)", unit_price: 1950000, currency: "THB" },
  { vendor: "HPE", part_number: "HPE-MSA2060", description: "HPE MSA 2060 SAN (12Gb SAS, 12x 1.92TB SSD, dual controller)", unit_price: 390000, currency: "THB" }
];

const client = getSupabaseAdmin();
if (!client) {
  console.log(JSON.stringify({ ok: false, error: "Supabase admin config is required" }, null, 2));
  process.exit(1);
}

const { data: existingRows, error: existingError } = await client
  .from("pricing_catalog")
  .select("part_number");

if (existingError) {
  console.log(JSON.stringify({ ok: false, error: existingError.message }, null, 2));
  process.exit(1);
}

const existingPartNumbers = new Set((existingRows ?? []).map((row) => row.part_number));
const rowsToInsert = rows.filter((row) => !existingPartNumbers.has(row.part_number));

if (rowsToInsert.length === 0) {
  console.log(JSON.stringify({ ok: true, count: 0, rows: [], message: "No new pricing rows to insert" }, null, 2));
  process.exit(0);
}

const { data, error } = await client
  .from("pricing_catalog")
  .insert(rowsToInsert)
  .select("id,vendor,part_number");

if (error) {
  console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, count: data.length, rows: data }, null, 2));
