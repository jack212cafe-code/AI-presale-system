// Grounding Validator: detect model numbers and capacities in BOM rows not found in KB chunks

// Matches hardware model tokens: R760, R7625, DD3300, ME5224, PowerStore-style 1200T, etc.
const MODEL_PATTERN = /\b([A-Z]{1,4}\d{2,5}[A-Za-z0-9]{0,5})\b/gi;
// Matches capacity patterns: 3.84TB, 1.2TB, 500GB, etc.
const CAPACITY_PATTERN = /(\d+(\.\d+)?)\s*(TB|GB)/gi;

function extractModels(text) {
  const found = new Set();
  for (const m of (text ?? "").matchAll(MODEL_PATTERN)) {
    found.add(m[1].toUpperCase());
  }
  return found;
}

function extractCapacity(text) {
  const match = CAPACITY_PATTERN.exec(text ?? "");
  return match ? match[0].toUpperCase() : null;
}

/**
 * Scan BOM rows against KB chunks.
 * Adds WARNING rows for any hardware model number or capacity not found in KB content.
 *
 * @param {object} bomJson  - sanitized BOM { rows, notes }
 * @param {Array}  kbChunks - chunks used during BOM generation (title + content)
 * @returns {object} BOM with warning rows appended
 */
// Model families: if a variant not explicitly in KB is used alongside a verified base model, skip warning
const MODEL_FAMILIES = {
  R760:   ["R760", "R760xs", "R760xd", "R760xd2"],
  R660:   ["R660", "R660xs"],
  R670:   ["R670", "R770"],
  R770:   ["R670", "R770"],
  DD6400: ["DD3300", "DD6400", "DD9400", "DDVE"],
  DD3300: ["DD3300", "DD6400", "DD9400", "DDVE"],
  DD9400: ["DD3300", "DD6400", "DD9400", "DDVE"]
};

function isKnownFamilyVariant(model, knownModels) {
  for (const [base, variants] of Object.entries(MODEL_FAMILIES)) {
    if (variants.includes(model) && knownModels.has(base)) {
      return true;
    }
  }
  return false;
}

export function groundBom(bomJson, kbChunks) {
  if (!kbChunks?.length) return bomJson;

  const knownModels = new Set();
  const knownCapacities = new Set();

  for (const chunk of kbChunks) {
    for (const m of extractModels(chunk.content)) knownModels.add(m);
    for (const m of extractModels(chunk.title)) knownModels.add(m);

    const content = chunk.content + " " + chunk.title;
    let match;
    while ((match = CAPACITY_PATTERN.exec(content)) !== null) {
      knownCapacities.add(match[0].toUpperCase());
    }
  }

  if (knownModels.size === 0 && knownCapacities.size === 0) return bomJson;

  const warningRows = [];
  const seenWarnings = new Set();

  for (const row of bomJson.rows) {
    const description = row.description || "";

    // 1. Model Grounding
    for (const model of extractModels(description)) {
      if (!knownModels.has(model) && !seenWarnings.has(`model:${model}`)) {
        if (isKnownFamilyVariant(model, knownModels)) continue;
        seenWarnings.add(`model:${model}`);
        warningRows.push({
          category: "GROUNDING WARNING",
          description: `⚠️ GROUNDING ALERT: Model "${model}" is NOT in the verified KB. Action: Verify if this is the current generation or replace with a verified model.`,
          qty: 1,
          notes: `Detected unverified model "${model}" in row: ${description.slice(0, 80)}…`
        });
      }
    }

    // 2. Capacity Grounding — skip if within common RAM ranges (128GB–2TB per socket is standard)
    const capacity = extractCapacity(description);
    if (capacity && !knownCapacities.has(capacity) && !seenWarnings.has(`cap:${capacity}`)) {
      const numMatch = capacity.match(/(\d+)/);
      const num = numMatch ? parseInt(numMatch[1]) : 0;
      const unit = capacity.includes("TB") ? "TB" : "GB";
      const inCommonRange = unit === "GB" && num >= 128 && num <= 2048;
      if (!inCommonRange) {
        seenWarnings.add(`cap:${capacity}`);
        warningRows.push({
          category: "GROUNDING WARNING",
          description: `⚠️ CAPACITY ALERT: Capacity "${capacity}" is not explicitly found in the KB for this product family. Action: Please verify if this specific capacity is available for the selected model.`,
          qty: 1,
          notes: `Unverified capacity "${capacity}" detected in row: ${description.slice(0, 80)}…`
        });
      }
    }
  }

  return {
    rows: [...bomJson.rows, ...warningRows],
    notes: bomJson.notes
  };
}
