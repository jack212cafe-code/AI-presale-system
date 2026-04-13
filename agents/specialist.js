import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "../lib/config.js";
import { withAgentLogging } from "../lib/logger.js";
import { generateJsonWithOpenAI } from "../lib/openai.js";
import { retrieveKnowledgeByVendorFilter, getSupabaseAdmin } from "../lib/supabase.js";
import { getKnowledge } from "./solution.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const specialistTextFormat = {
  type: "json_schema",
  name: "specialist_brief",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      domain: { type: "string" },
      analysis: { type: "string" },
      constraints: { type: "array", items: { type: "string" } },
      technical_specs: {
        type: "object",
        additionalProperties: false,
        properties: {
          compute: {
            type: "object",
            additionalProperties: false,
            properties: {
              cpu_cores: { type: "integer" },
              ram_gb: { type: "integer" },
              sockets: { type: "integer" },
              cores_per_socket: { type: "integer" },
              rationale: { type: "string" }
            },
            required: ["cpu_cores", "ram_gb", "sockets", "cores_per_socket", "rationale"]
          },
          storage: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                model: { type: "string" },
                capacity_tb: { type: "number" },
                type: { type: "string", enum: ["NVMe", "SSD", "HDD", "Hybrid"] },
                count: { type: "integer" },
                rationale: { type: "string" }
              },
              required: ["model", "capacity_tb", "type", "count", "rationale"]
            }
          },
          licenses: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                name: { type: "string" },
                quantity: { type: "integer" },
                unit: { type: "string" },
                rule_violated: { type: ["string", "null"] },
                correction: { type: ["string", "null"] }
              },
              required: ["name", "quantity", "unit", "rule_violated", "correction"]
            }
          }
        },
        required: ["compute", "storage", "licenses"]
      },
      recommendations: { type: "array", items: { type: "string" } },
      licensing_flags: { type: "array", items: { type: "string" } },
      risks: { type: "array", items: { type: "string" } }
    },
    required: ["domain", "analysis", "constraints", "technical_specs", "recommendations", "licensing_flags", "risks"]
  }
};

const MOCK_BRIEFS = {
  dell_presale: (requirements) => ({
    domain: "dell_presale",
    analysis: "3-node Dell HCI cluster sufficient for stated VM count. PowerEdge R760xs recommended.",
    constraints: ["Minimum 3 nodes required for HCI N+1 tolerance"],
    technical_specs: {
      compute: {
        cpu_cores: 64,
        ram_gb: 512,
        sockets: 2,
        cores_per_socket: 32,
        rationale: `VM count: ${requirements.scale?.vm_count ?? 50}. RAM/node: ${Math.ceil((requirements.scale?.vm_count ?? 50) * 8 * 1.2 / 3 / 128) * 128}GB`
      },
      storage: [
        { model: "PowerEdge R760xs NVMe", capacity_tb: 3.84, type: "NVMe", count: 4, rationale: "Standard boot/app drive for HCI" }
      ],
      licenses: [
        { name: "Windows Server DC", quantity: 1, unit: "server", correction: "Min 16 cores/socket, 2 sockets" }
      ]
    },
    recommendations: ["Dell PowerEdge R760 (standard compute) or R760xs (NVMe-dense) for this scale", "PowerStore 1200T for primary shared storage if 3-tier required"],
    licensing_flags: ["VMware: Broadcom subscription only since 2024, ~3x cost increase. Consider Nutanix AHV on Dell hardware.", "WS DC 2022: ฿220,000/server for 2-socket (32-core min)"],
    risks: ["Confirm VM average RAM before finalizing node spec", "GPU server lead time 12-24 weeks in Thailand"]
  }),
  hpe_presale: (requirements) => ({
    domain: "hpe_presale",
    analysis: "3-node HPE HCI cluster sufficient for stated VM count. ProLiant DL380 Gen11 recommended.",
    constraints: ["Minimum 3 nodes required for HCI N+1 tolerance", "HPE SimpliVity requires VMware vSphere — Broadcom cost must be included"],
    technical_specs: {
      compute: {
        cpu_cores: 64,
        ram_gb: 512,
        sockets: 2,
        cores_per_socket: 32,
        rationale: `VM count: ${requirements.scale?.vm_count ?? 50}. RAM/node: ${Math.ceil((requirements.scale?.vm_count ?? 50) * 8 * 1.2 / 3 / 128) * 128}GB`
      },
      storage: [
        { model: "HPE SimpliVity SSD", capacity_tb: 2.4, type: "SSD", count: 4, rationale: "OmniStack SSD minimum" }
      ],
      licenses: [
        { name: "Windows Server DC", quantity: 1, unit: "server", correction: "Min 16 cores/socket, 2 sockets" }
      ]
    },
    recommendations: ["HPE ProLiant DL380 Gen11 for compute", "HPE Alletra 6030 for primary storage if 3-tier required"],
    licensing_flags: ["VMware mandatory for SimpliVity: Broadcom subscription ~200-300% vs pre-2024 pricing", "HPE iLO Advanced: separate license required for full remote management", "WS DC 2022: ฿220,000/server for 2-socket"],
    risks: ["SimpliVity VMware dependency — Broadcom cost shock common", "Alletra 9000 lead time 8-12 weeks", "Confirm whether customer prefers CapEx or GreenLake OpEx model"]
  }),
  lenovo_presale: (requirements) => ({
    domain: "lenovo_presale",
    analysis: "3-node Lenovo ThinkAgile HX (Nutanix) cluster recommended. SR650 V3 with AHV — no VMware licensing required.",
    constraints: ["Minimum 3 nodes required for HCI N+1 tolerance", "ThinkAgile VX (vSAN) requires VMware — recommend HX (Nutanix) for cost saving"],
    technical_specs: {
      compute: {
        cpu_cores: 64,
        ram_gb: 512,
        sockets: 2,
        cores_per_socket: 32,
        rationale: `VM count: ${requirements.scale?.vm_count ?? 50}. RAM/node: ${Math.ceil((requirements.scale?.vm_count ?? 50) * 8 * 1.2 / 3 / 128) * 128}GB`
      },
      storage: [
        { model: "ThinkAgile HX NVMe", capacity_tb: 3.84, type: "NVMe", count: 4, rationale: "Standard NVMe for HCI" }
      ],
      licenses: [
        { name: "Windows Server DC", quantity: 1, unit: "server", correction: "Min 16 cores/socket, 2 sockets" }
      ]
    },
    recommendations: ["Lenovo ThinkAgile HX650 V3 (SR650 V3 + Nutanix AOS) for HCI", "ThinkSystem DE6400F for 3-tier primary storage if required"],
    licensing_flags: ["Nutanix AHV included in AOS — no hypervisor cost. Major TCO advantage vs VMware.", "Azure Stack HCI (ThinkAgile MX): requires WS DC Azure Edition per core + Azure Arc subscription ~฿500-1,500/node/month", "WS DC 2022: ฿220,000/server for 2-socket if Windows guest licensing needed"],
    risks: ["Lenovo storage portfolio narrower than Dell/HPE — validate DE series capacity fits requirement", "Lead time Thailand 3-5 weeks standard, GPU 12-20 weeks", "ONTAP DM series: confirm partner has ONTAP support capability in Thailand"]
  }),
  neteng: (requirements) => ({
    domain: "neteng",
    analysis: "Dual 25GbE NICs per node required for HCI storage traffic.",
    constraints: ["Minimum 25GbE per node for HCI/Ceph storage traffic"],
    technical_specs: {
      compute: { cpu_cores: 0, ram_gb: 0, sockets: 0, cores_per_socket: 0, rationale: "Network analysis only" },
      storage: [],
      licenses: []
    },
    recommendations: ["Cisco Catalyst 9300-48UXM or Aruba 6300M for top-of-rack"],
    licensing_flags: [],
    risks: ["Verify existing switch supports jumbo frames (MTU 9000) for storage traffic"]
  }),
  devops: (requirements) => ({
    domain: "devops",
    analysis: "Daily backup sufficient for most workloads. Backup repository sized at 2x protected data.",
    constraints: ["Backup repository must be separate from production storage"],
    technical_specs: {
      compute: { cpu_cores: 0, ram_gb: 0, sockets: 0, cores_per_socket: 0, rationale: "Backup server sizing" },
      storage: [
        { model: "Backup Repository", capacity_tb: Math.ceil((requirements.scale?.storage_tb ?? 10) * 2 * 1.3), type: "HDD", count: 1, rationale: "2x protected data + 30% overhead" }
      ],
      licenses: []
    },
    recommendations: ["Veeam Data Platform Advanced — includes Veeam ONE monitoring"],
    licensing_flags: ["Per-VM license vs per-socket: calculate at final VM count"],
    risks: ["No monitoring stack specified — add Veeam ONE or Prometheus/Grafana"]
  }),
  ai_eng: (requirements) => ({
    domain: "ai_eng",
    analysis: "AI workload detected. Inference-only recommended as starting point.",
    constraints: ["GPU memory must match largest model to be served"],
    sizing_notes: ["7B-13B inference: 1x A100 40GB minimum"],
    recommendations: ["Dell PowerEdge R760xa with 1-2x NVIDIA A100 40GB for inference"],
    licensing_flags: ["NVIDIA GPU supply chain: 3-6 month lead time for H100 in Thailand"],
    risks: ["Distinguish inference vs training requirement before sizing — major cost difference"]
  })
};

// KB source keywords per specialist domain
const DOMAIN_KB_VENDORS = {
  dell_presale:   ["Dell"],
  hpe_presale:    ["HPE", "Nutanix"],
  lenovo_presale: ["Nutanix"],          // ThinkAgile HX = Nutanix on Lenovo; no dedicated Lenovo KB yet
  neteng:         [],                   // no network switch spec sheets yet — vector only
  devops:         ["Veeam", "Dell"],    // Veeam + PowerProtect DD + PowerVault
  ai_eng:         ["Dell"]             // PowerEdge GPU configs
};

// Vector query per domain — focused on what the specialist needs to know
const DOMAIN_VECTOR_QUERY = {
  dell_presale:   "Dell PowerEdge server PowerStore storage PowerScale NVMe SAN iSCSI Fibre Channel",
  hpe_presale:    "HPE ProLiant server Alletra storage SimpliVity StoreFabric SAN FC iSCSI NVMe",
  lenovo_presale: "Lenovo ThinkSystem ThinkAgile server storage Nutanix HCI Azure Stack HCI SAN NVMe iSCSI",
  neteng:         "network switch storage traffic 25GbE iSCSI NFS Fibre Channel SAN",
  devops:         "backup repository Veeam sizing deduplication immutable",
  ai_eng:         "GPU server inference NVIDIA accelerator"
};

// Domain-specific keyword filters for KB retrieval
const DOMAIN_KB_KEYWORDS = {
  devops:         ["veeam", "powerprotect", "powervault"],
  dell_presale:   ["poweredge", "powerstore", "powerscale", "powervault", "powerprotect", "dell"],
  hpe_presale:    ["proliant", "alletra", "simplivity", "storeonce", "storefabric", "hpe", "msa"],
  lenovo_presale: ["thinksystem", "thinkagile", "lenovo", "nutanix"]
};

async function retrieveKbForDomain(domain, requirements) {
  const _t = Date.now();
  console.log(`[kb:${domain}] started`);
  const chunks = new Map();

  // 1. Vendor-filtered: pull spec sheets relevant to this domain
  const vendorNames = DOMAIN_KB_VENDORS[domain] ?? [];
  if (vendorNames.length > 0) {
    try {
      // Use domain-specific keyword override if defined, else default vendor mapping
      const keywords = DOMAIN_KB_KEYWORDS[domain];
      let vendorChunks;

      if (keywords) {
        // Custom keyword filter for this domain
        const client = getSupabaseAdmin();
        if (client) {
          const seen = new Set();
          vendorChunks = [];
          for (const kw of keywords) {
            console.log(`[kb:${domain}] +${Date.now()-_t}ms ilike kw="${kw}"`);
            const { data } = await client.from("knowledge_base")
              .select("source_key, title, content, category, metadata")
              .ilike("source_key", `%${kw}%`)
              .not("content", "ilike", "-- % of %")
              .order("source_key", { ascending: true })
              .limit(4);
            console.log(`[kb:${domain}] +${Date.now()-_t}ms ilike done kw="${kw}" rows=${data?.length ?? 0}`);
            for (const c of data ?? []) {
              if (!seen.has(c.source_key)) { seen.add(c.source_key); vendorChunks.push(c); }
            }
          }
        }
      } else {
        vendorChunks = await retrieveKnowledgeByVendorFilter(vendorNames, 3);
      }
      for (const c of vendorChunks ?? []) chunks.set(c.source_key, c);
    } catch { /* KB unavailable */ }
  }

  // 2. Vector: use-case context query specific to this domain
  try {
    const query = DOMAIN_VECTOR_QUERY[domain];
    if (query) {
      const reqWithQuery = { ...requirements, _kb_hint: query };
      const { chunks: vectorChunks } = await getKnowledge(reqWithQuery);
      for (const c of vectorChunks) {
        if (!chunks.has(c.source_key)) chunks.set(c.source_key, c);
      }
    }
  } catch { /* KB unavailable */ }

  console.log(`[kb:${domain}] +${Date.now()-_t}ms done chunks=${chunks.size}`);
  return Array.from(chunks.values());
}

function isAiWorkload(requirements) {
  const text = JSON.stringify(requirements).toLowerCase();
  return [/\bai\b/, /\bml\b/, /machine learning/, /\bgpu\b/, /\binference\b/, /\btraining\b/, /\bllm\b/, /generative/, /data science/]
    .some(re => re.test(text));
}

export function getActiveSpecialists(requirements) {
  const preferred = requirements?.vendor_preferences?.preferred ?? [];
  const VENDOR_MAP = { dell: "dell_presale", hpe: "hpe_presale", hewlett: "hpe_presale", lenovo: "lenovo_presale" };
  let vendorSpecialists = preferred.length > 0
    ? [...new Set(preferred.map(v => VENDOR_MAP[v.toLowerCase()]).filter(Boolean))]
    : [];
  if (!vendorSpecialists.length) vendorSpecialists = ["dell_presale", "hpe_presale", "lenovo_presale"];
  const specialists = [...vendorSpecialists, "neteng", "devops"];
  if (isAiWorkload(requirements)) specialists.push("ai_eng");
  return specialists;
}

export async function runSpecialistAgent(domain, requirements, options = {}) {
  const _t = Date.now();
  console.log(`[specialist:${domain}] started`);
  const promptPath = path.join(__dirname, "_prompts", `${domain}.md`);
  const prompt = await readFile(promptPath, "utf8");

  console.log(`[specialist:${domain}] +${Date.now()-_t}ms kb-fetch started`);
  const kbChunks = await retrieveKbForDomain(domain, requirements);
  console.log(`[specialist:${domain}] +${Date.now()-_t}ms kb-fetch done chunks=${kbChunks.length}`);

  let kbContext = "";
  if (kbChunks.length > 0) {
    kbContext = `\n\n[PRODUCT KNOWLEDGE BASE]\nSpec sheet data — use these model numbers, capacities, and specs as ground truth. Do NOT use training data when this conflicts:\n\n${kbChunks.map(c => `### ${c.title}\n${c.content}`).join("\n\n")}`;
  }

  console.log(`[specialist:${domain}] +${Date.now()-_t}ms openai started`);
  const output = await withAgentLogging(
    {
      agentName: `specialist_${domain}`,
      projectId: options.projectId,
      modelUsed: config.openai.models.specialist,
      input: { domain, scale: requirements.scale, use_cases: requirements.use_cases },
      kbChunksInjected: kbChunks.length
    },
    () =>
      generateJsonWithOpenAI({
        systemPrompt: prompt + kbContext,
        userPrompt: JSON.stringify(requirements, null, 2),
        model: config.openai.models.specialist,
        textFormat: specialistTextFormat,
        maxOutputTokens: 2000,
        timeoutMs: 30_000,
        mockResponseFactory: async () => MOCK_BRIEFS[domain]?.(requirements) ?? { domain, analysis: "", constraints: [], sizing_notes: [], recommendations: [], licensing_flags: [], risks: [] }
      })
  );
  console.log(`[specialist:${domain}] +${Date.now()-_t}ms openai done`);

  return output;
}

export async function runAllSpecialists(requirements, options = {}) {
  const domains = getActiveSpecialists(requirements);
  const _t = Date.now();
  console.log(`[specialists:all] started domains=${domains.join(",")}`);

  const results = await Promise.allSettled(
    domains.map(domain => runSpecialistAgent(domain, requirements, options))
  );
  console.log(`[specialists:all] +${Date.now()-_t}ms all settled`);

  return results
    .map((result, i) => {
      if (result.status === "fulfilled") return result.value;
      const domain = domains[i];
      console.warn(`[specialist:${domain}] failed: ${result.reason?.message}`);
      return { domain, analysis: `⚠️ ไม่สามารถวิเคราะห์ ${domain} ได้ — ใช้ข้อมูลทั่วไป`, constraints: [], sizing_notes: [`specialist ${domain} ไม่ตอบสนอง — ยืนยัน spec กับ vendor ก่อน propose`], recommendations: [], licensing_flags: [], risks: [] };
    })
    .filter(Boolean);
}
