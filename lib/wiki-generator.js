import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { generateJsonWithOpenAI } from "./openai.js";
import { config } from "./config.js";
import { upsertWikiPage } from "./db/wiki.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const WIKI_PROMPT = readFileSync(resolve(__dirname, "../agents/_prompts/wiki-generator.md"), "utf-8");

const WIKI_TEXT_FORMAT = {
  name: "wiki_page",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      product_name: { type: "string" },
      vendor: { type: "string" },
      category: { type: "string", enum: ["server", "storage", "network", "backup", "software"] },
      overview: { type: "string" },
      key_specs: { type: "array", items: { type: "string" } },
      key_features: { type: "array", items: { type: "string" } },
      tor_keywords: { type: "string" },
      positioning: { type: "string" },
      related_products: { type: "array", items: { type: "string" } }
    },
    required: ["product_name", "vendor", "category", "overview", "key_specs", "key_features", "tor_keywords", "positioning", "related_products"]
  }
};

function assembleBodyMarkdown(fields) {
  const specBullets = fields.key_specs.map((s) => `- ${s}`).join("\n");
  const featureBullets = fields.key_features.map((f) => `- ${f}`).join("\n");
  const relatedLinks = fields.related_products.map((p) => `- [[${p}]]`).join("\n");

  return `# ${fields.product_name}

## Overview
${fields.overview}

## Key Specs
${specBullets}

## Key Features
${featureBullets}

## TOR Keywords
${fields.tor_keywords}

## Positioning
${fields.positioning}

## Related Products
${relatedLinks}`;
}

export async function generateWikiPageFromText({ extractedText, fileName, sourceDocumentKeys = [], orgId = null }) {
  const model = config.openai.models?.wiki || config.openai.models?.solution || "gpt-4o-mini";

  const userPrompt = `Extract structured product knowledge from this datasheet text.\n\nSource file: ${fileName}\n\n---\n${extractedText.slice(0, 12000)}`;

  const { output, usage, mock } = await generateJsonWithOpenAI({
    systemPrompt: WIKI_PROMPT,
    userPrompt,
    model,
    maxOutputTokens: 2000,
    textFormat: WIKI_TEXT_FORMAT,
    mockResponseFactory: async () => ({
      product_name: fileName.replace(/\.[^.]+$/, ""),
      vendor: "Unknown",
      category: "server",
      overview: "Mock wiki page - OpenAI unavailable",
      key_specs: ["N/A"],
      key_features: ["N/A"],
      tor_keywords: "mock",
      positioning: "Mock - generated in local mode",
      related_products: []
    })
  });

  const bodyMarkdown = assembleBodyMarkdown(output);
  const wikiPage = {
    product_name: output.product_name,
    vendor: output.vendor,
    category: output.category,
    overview: output.overview,
    key_specs: output.key_specs.join("\n"),
    key_features: output.key_features.join("\n"),
    tor_keywords: output.tor_keywords,
    positioning: output.positioning,
    related_products: output.related_products,
    body_markdown: bodyMarkdown,
    source_document_keys: sourceDocumentKeys,
    org_id: orgId
  };

  const saved = await upsertWikiPage(wikiPage);
  return { page: saved, usage, mock };
}