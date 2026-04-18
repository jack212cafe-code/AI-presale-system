// Grounding Validator: detect model numbers and capacities in BOM rows not found in KB chunks.
// When an ungrounded model is detected, try to auto-upgrade to a newer variant of the same
// product family that IS in KB (e.g., DD6400 → DD6410). Fall back to GROUNDING WARNING when no
// upgrade is available.

const MODEL_PATTERN = /\b([A-Z]{1,4}\d{2,5}[A-Za-z0-9]{0,5})\b/gi;
const CAPACITY_PATTERN = /(\d+(\.\d+)?)\s*(TB|GB)/gi;

const MODEL_TOKEN_DENYLIST = new Set([
  "GEN10", "GEN11", "GEN12", "DDR4", "DDR5", "RAID5", "RAID6", "RAID10",
  "USB3", "PCIE4", "PCIE5", "FC32", "FC64", "ISO27001", "SOC2", "TLS12", "TLS13",
  "IPV4", "IPV6", "HTTP2", "HTTP3"
]);

function extractModels(text) {
  const found = new Set();
  for (const m of (text ?? "").matchAll(MODEL_PATTERN)) {
    const token = m[1].toUpperCase();
    if (MODEL_TOKEN_DENYLIST.has(token)) continue;
    found.add(token);
  }
  return found;
}

function extractCapacity(text) {
  CAPACITY_PATTERN.lastIndex = 0;
  const match = CAPACITY_PATTERN.exec(text ?? "");
  return match ? match[0].toUpperCase() : null;
}

function parseModel(token) {
  const m = String(token ?? "").match(/^([A-Z]+)(\d+)([A-Za-z0-9]*)$/i);
  if (!m) return null;
  return {
    prefix: m[1].toUpperCase(),
    num: m[2],
    numInt: parseInt(m[2], 10),
    suffix: (m[3] || "").toUpperCase(),
    raw: token.toUpperCase()
  };
}

// Family key rules:
//   ≥4 digits  → prefix + first 2 digits (DD6410 → "DD64", keeps DD64xx together; DD33xx, DD94xx separate)
//   3 digits   → prefix + first 1 digit  (R760 → "R7", groups R760/R770/R7xx generations)
//   ≤2 digits  → prefix + first 1 digit
function familyKey(parsed) {
  if (!parsed) return null;
  const { prefix, num } = parsed;
  const sig = num.length >= 4 ? num.slice(0, 2) : num.slice(0, 1);
  return `${prefix}${sig}`;
}

export function findNewerVariantInKb(model, knownModels) {
  const parsed = parseModel(model);
  if (!parsed) return null;
  const targetFamily = familyKey(parsed);
  let best = null;
  for (const candidate of knownModels) {
    const cp = parseModel(candidate);
    if (!cp || cp.raw === parsed.raw) continue;
    if (familyKey(cp) !== targetFamily) continue;
    if (cp.numInt > parsed.numInt && (!best || cp.numInt > best.numInt)) {
      best = cp;
    }
  }
  return best ? best.raw : null;
}

function replaceModelToken(text, oldModel, newModel) {
  const escaped = oldModel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(text ?? "").replace(new RegExp(`\\b${escaped}\\b`, "gi"), newModel);
}

export function groundBom(bomJson, kbChunks) {
  if (!kbChunks?.length) return bomJson;

  const knownModels = new Set();
  const knownCapacities = new Set();

  for (const chunk of kbChunks) {
    for (const m of extractModels(chunk.content)) knownModels.add(m);
    for (const m of extractModels(chunk.title)) knownModels.add(m);

    const content = `${chunk.content ?? ""} ${chunk.title ?? ""}`;
    CAPACITY_PATTERN.lastIndex = 0;
    let match;
    while ((match = CAPACITY_PATTERN.exec(content)) !== null) {
      knownCapacities.add(match[0].toUpperCase());
    }
  }

  if (knownModels.size === 0 && knownCapacities.size === 0) return bomJson;

  const upgradedRows = [];
  const warningRows = [];
  const seenWarnings = new Set();
  const extraNotes = [];

  for (const row of bomJson.rows) {
    let description = row.description || "";
    let notes = row.notes || "";
    let upgraded = false;

    for (const model of extractModels(description)) {
      if (knownModels.has(model)) continue;

      const upgrade = findNewerVariantInKb(model, knownModels);
      if (upgrade) {
        description = replaceModelToken(description, model, upgrade);
        notes = notes
          ? `${notes} | upgraded from ${model} → ${upgrade} (newest KB variant)`
          : `upgraded from ${model} → ${upgrade} (newest KB variant)`;
        extraNotes.push(`Auto-upgraded ${model} → ${upgrade} based on KB`);
        upgraded = true;
        continue;
      }

      if (!seenWarnings.has(`model:${model}`)) {
        seenWarnings.add(`model:${model}`);
        warningRows.push({
          category: "GROUNDING WARNING",
          description: `⚠️ GROUNDING ALERT: Model "${model}" is NOT in the verified KB and no newer variant of its family is available. Action: verify with distributor or add this model to KB.`,
          qty: 1,
          notes: `Unverified model "${model}" in row: ${description.slice(0, 80)}…`
        });
      }
    }

    const capacity = extractCapacity(description);
    if (capacity && !knownCapacities.has(capacity) && !seenWarnings.has(`cap:${capacity}`)) {
      const numMatch = capacity.match(/(\d+)/);
      const num = numMatch ? parseInt(numMatch[1], 10) : 0;
      const unit = capacity.includes("TB") ? "TB" : "GB";
      const inCommonRamRange = unit === "GB" && num >= 128 && num <= 2048;
      if (!inCommonRamRange) {
        seenWarnings.add(`cap:${capacity}`);
        warningRows.push({
          category: "GROUNDING WARNING",
          description: `⚠️ CAPACITY ALERT: Capacity "${capacity}" is not explicitly found in the KB for this product family. Action: verify with distributor.`,
          qty: 1,
          notes: `Unverified capacity "${capacity}" in row: ${description.slice(0, 80)}…`
        });
      }
    }

    upgradedRows.push(upgraded ? { ...row, description, notes } : row);
  }

  return {
    rows: [...upgradedRows, ...warningRows],
    notes: [...(bomJson.notes ?? []), ...extraNotes]
  };
}
