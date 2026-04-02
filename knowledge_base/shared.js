import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const seedDir = path.join(__dirname, "seed");

const taxonomyRules = [
  {
    id: "presale_playbook",
    pattern: /playbook|pattern|questions|qualification|cutover|migration|commercial defense|security baseline|discovery framework/i,
    category: "presale_playbook",
    vendor: "multi-vendor",
    tags: ["presale", "playbook", "delivery"]
  },
  {
    id: "security_architecture",
    pattern: /security|firewall|zero trust|mfa|segmentation|fortinet|cyber/i,
    category: "security_architecture",
    vendor: "multi-vendor",
    tags: ["security", "segmentation", "operations"]
  },
  {
    id: "devops_platform",
    pattern: /devops|ci\/cd|gitops|terraform|ansible|kubernetes|observability|sre|pipeline/i,
    category: "devops_platform",
    vendor: "multi-vendor",
    tags: ["devops", "automation", "platform"]
  },
  {
    id: "network_architecture",
    pattern: /network|switch|switching|routing|sdn|vxlan|bgp|evpn|vlan|firewall/i,
    category: "network_architecture",
    vendor: "multi-vendor",
    tags: ["network", "switching", "sdn"]
  },
  {
    id: "commercial_rule",
    pattern: /pricing|bom|sku|license|commercial/i,
    category: "commercial_rule",
    vendor: "multi-vendor",
    tags: ["pricing", "bom"]
  },
  {
    id: "platform_architecture",
    pattern: /server|storage|hci|nutanix|cluster|virtualization|hypervisor|san|nas/i,
    category: "platform_architecture",
    vendor: "multi-vendor",
    tags: ["server", "storage", "virtualization"]
  },
  {
    id: "dr_strategy",
    pattern: /\bdr\b|disaster|pilot-light|warm site|hot site|replication|tiering/i,
    category: "dr_strategy",
    vendor: "multi-vendor",
    tags: ["dr", "rto", "rpo"]
  },
  {
    id: "backup_strategy",
    pattern: /backup|ransomware|immutab|retention|air-gap/i,
    category: "backup_strategy",
    vendor: "multi-vendor",
    tags: ["backup", "recovery"]
  }
];

function toTitleCase(value) {
  return value
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
}

export function inferMetadata(fileName, title, content) {
  const primaryHaystack = `${fileName}\n${title}`;
  const secondaryHaystack = content;
  const matchedRule =
    taxonomyRules.find((rule) => rule.pattern.test(primaryHaystack)) ??
    taxonomyRules.find((rule) => rule.pattern.test(secondaryHaystack));
  const normalizedName = fileName.replace(/\.[^.]+$/, "");

  return {
    source_file: fileName,
    category: matchedRule?.category ?? "general_reference",
    vendor: matchedRule?.vendor ?? "multi-vendor",
    product_family: toTitleCase(normalizedName),
    trust_level: "starter_seed",
    revision_date: new Date().toISOString().slice(0, 10),
    tags: matchedRule?.tags ?? ["general"]
  };
}

export function chunkText(content, options = {}) {
  const maxCharacters = Number(options.maxCharacters) || 1600;
  const overlapCharacters = Number(options.overlapCharacters) || 200;
  const normalized = String(content || "")
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/\u0000/g, "")
    .replace(/[ ]{2,}/g, " ")
    .trim();

  if (!normalized) {
    return [];
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxCharacters) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
    }

    if (paragraph.length <= maxCharacters) {
      current = paragraph;
      continue;
    }

    for (let index = 0; index < paragraph.length; index += maxCharacters - overlapCharacters) {
      chunks.push(paragraph.slice(index, index + maxCharacters).trim());
    }
    current = "";
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.filter(Boolean);
}

export async function loadSeedEntries() {
  const files = await readdir(seedDir, { withFileTypes: true });
  const entries = [];

  for (const file of files) {
    if (!file.isFile()) {
      continue;
    }

    const absolutePath = path.join(seedDir, file.name);
    const content = await readFile(absolutePath, "utf8");
    const titleMatch = content.match(/^#\s+(.+)$/m);

    entries.push({
      source_key: `seed/${file.name}`,
      title: titleMatch ? titleMatch[1].trim() : file.name,
      content,
      metadata: inferMetadata(file.name, titleMatch ? titleMatch[1].trim() : file.name, content)
    });
  }

  return entries;
}

export async function retrieveLocalKnowledge(queryText, limit = 5) {
  const normalizedQuery = String(queryText || "").toLowerCase();
  const queryTerms = normalizedQuery.split(/[^a-z0-9]+/i).filter(Boolean);
  const entries = await loadSeedEntries();

  const scored = entries
    .map((entry) => {
      const haystack = `${entry.title}\n${entry.content}`.toLowerCase();
      const score = queryTerms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { ...entry, score };
    })
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title));

  return scored.slice(0, limit);
}
