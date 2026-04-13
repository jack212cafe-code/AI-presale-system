import "dotenv/config";
import { createRequire } from "node:module";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config, hasEmbeddingConfig } from "../lib/config.js";
import { upsertKnowledgeBase } from "../lib/supabase.js";
import { logger } from "../lib/logger.js";
import { chunkText, inferMetadata } from "./shared.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const rawDir = path.join(__dirname, "raw");
export const manifestPath = path.join(__dirname, "raw-manifest.json");

const _require = createRequire(import.meta.url);

export const supportedExtensions = new Set([".md", ".txt", ".json", ".csv", ".pdf", ".docx", ".xlsx"]);

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanText(content) {
  return String(content || "")
    .replace(/\r/g, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function inferDocumentType(extension, relativePath) {
  const haystack = `${extension} ${relativePath}`.toLowerCase();
  if (haystack.includes("datasheet")) {
    return "datasheet";
  }
  if (haystack.includes("catalog")) {
    return "product_catalog";
  }
  if (haystack.includes("best-practice")) {
    return "best_practice";
  }
  if (haystack.includes("user-guide") || haystack.includes("guide")) {
    return "user_guide";
  }
  if (extension === ".xlsx" || extension === ".csv") {
    return "catalog_table";
  }
  return "reference_document";
}

function getDependency(name) {
  try {
    return _require(name);
  } catch (error) {
    throw new Error(`Missing parser dependency "${name}". Install with: npm install ${name}`);
  }
}

async function walkFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(absolutePath)));
      continue;
    }

    files.push(absolutePath);
  }

  return files;
}

async function readSidecarMetadata(absolutePath) {
  const sidecarPath = `${absolutePath}.meta.json`;
  try {
    const content = await readFile(sidecarPath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {};
    }

    throw new Error(`Invalid metadata sidecar for ${absolutePath}: ${error.message}`);
  }
}

async function extractTextFromFile(absolutePath) {
  const extension = path.extname(absolutePath).toLowerCase();

  if (extension === ".md" || extension === ".txt" || extension === ".csv") {
    return cleanText(await readFile(absolutePath, "utf8"));
  }

  if (extension === ".json") {
    const parsed = JSON.parse(await readFile(absolutePath, "utf8"));
    return cleanText(JSON.stringify(parsed, null, 2));
  }

  if (extension === ".pdf") {
    const pdfParse = getDependency("pdf-parse");
    const buffer = await readFile(absolutePath);

    try {
      const result = await pdfParse(buffer);
      return cleanText(result.text);
    } catch (error) {
      throw new Error(`PDF parsing failed for ${absolutePath}: ${error.message}`);
    }
  }

  if (extension === ".docx") {
    const mammoth = getDependency("mammoth");
    const result = await mammoth.extractRawText({ path: absolutePath });
    return cleanText(result.value);
  }

  if (extension === ".xlsx") {
    const xlsx = getDependency("xlsx");
    const workbook = xlsx.readFile(absolutePath);
    const sheetTexts = workbook.SheetNames.map((sheetName) => {
      const csv = xlsx.utils.sheet_to_csv(workbook.Sheets[sheetName]);
      return `# Sheet: ${sheetName}\n${csv}`;
    });
    return cleanText(sheetTexts.join("\n\n"));
  }

  throw new Error(`Unsupported file extension: ${extension}`);
}

async function embedText(content) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.embeddings.openAiApiKey}`
    },
    body: JSON.stringify({
      model: config.embeddings.model,
      input: content
    })
  });

  if (!response.ok) {
    throw new Error(`Embedding request failed with status ${response.status}`);
  }

  const payload = await response.json();
  return payload.data?.[0]?.embedding ?? null;
}

async function embedTexts(contents) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.embeddings.openAiApiKey}`
    },
    body: JSON.stringify({
      model: config.embeddings.model,
      input: contents
    })
  });

  if (!response.ok) {
    throw new Error(`Embedding request failed with status ${response.status}`);
  }

  const payload = await response.json();
  return Array.isArray(payload.data) ? payload.data.map((item) => item.embedding ?? null) : [];
}

function sanitizeRelativeFileName(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  if (!supportedExtensions.has(extension)) {
    throw new Error(`Unsupported file type: ${extension || "unknown"}`);
  }

  const baseName = path.basename(fileName, extension);
  const safeBase = slugify(baseName) || "document";
  return `${safeBase}${extension}`;
}

export async function ensureRawDirectory() {
  await mkdir(path.join(rawDir, "uploads"), { recursive: true });
}

export async function saveUploadedRawDocument({ fileName, contentBase64, metadata = {} }) {
  await ensureRawDirectory();

  const safeName = sanitizeRelativeFileName(fileName);
  const relativePath = path.join("uploads", safeName).replace(/\\/g, "/");
  const absolutePath = path.join(rawDir, relativePath);
  const sidecarPath = `${absolutePath}.meta.json`;
  const buffer = Buffer.from(String(contentBase64 || ""), "base64");

  await writeFile(absolutePath, buffer);
  await writeFile(sidecarPath, JSON.stringify(metadata, null, 2), "utf8");

  return {
    relativePath,
    absolutePath,
    sidecarPath
  };
}

export async function deleteRawDocumentFiles(relativePath) {
  const normalized = String(relativePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) {
    throw new Error("Invalid source_file");
  }

  const absolutePath = path.join(rawDir, normalized);
  const sidecarPath = `${absolutePath}.meta.json`;

  await rm(absolutePath, { force: true });
  await rm(sidecarPath, { force: true });
}

async function buildDocumentEntry(absolutePath, options) {
  const relativePath = path.relative(rawDir, absolutePath).replace(/\\/g, "/");
  const extension = path.extname(absolutePath).toLowerCase();
  const baseName = path.basename(absolutePath, extension);
  const sidecarMetadata = await readSidecarMetadata(absolutePath);
  const text = await extractTextFromFile(absolutePath);
  const title = sidecarMetadata.title || baseName.replace(/[-_]+/g, " ").trim();
  const inferredMetadata = inferMetadata(path.basename(absolutePath), title, text);
  const fileStats = await stat(absolutePath);
  const maxFileBytes = config.knowledgeImport.maxFileSizeMb * 1024 * 1024;
  if (fileStats.size > maxFileBytes) {
    throw new Error(
      `File ${relativePath} is too large (${Math.round(fileStats.size / (1024 * 1024))} MB). Limit is ${config.knowledgeImport.maxFileSizeMb} MB. Split the PDF into smaller sections before importing.`
    );
  }

  const chunks = chunkText(text, {
    maxCharacters: options.chunkSize,
    overlapCharacters: options.chunkOverlap
  });

  if (chunks.length === 0) {
    const ext = path.extname(absolutePath).toLowerCase();
    if (ext === ".pdf") {
      throw new Error(`No text extracted from ${relativePath}. This PDF may be image-only (scanned). Convert to text-based PDF before importing.`);
    }
    return null;
  }

  if (chunks.length > config.knowledgeImport.maxChunksPerDocument) {
    throw new Error(
      `File ${relativePath} generated ${chunks.length} chunks, which exceeds the limit of ${config.knowledgeImport.maxChunksPerDocument}. Split the document into smaller parts such as installation, configuration, and reference sections before importing.`
    );
  }

  const documentType = sidecarMetadata.document_type || inferDocumentType(extension, relativePath);
  const sharedMetadata = {
    ...inferredMetadata,
    ...sidecarMetadata,
    source_file: relativePath,
    title,
    document_type: documentType,
    file_extension: extension,
    imported_at: new Date().toISOString(),
    file_size_bytes: fileStats.size,
    trust_level: sidecarMetadata.trust_level || "raw_import",
    revision_date: sidecarMetadata.revision_date || inferredMetadata.revision_date
  };

  return {
    relativePath,
    title,
    chunks: chunks.map((content, index) => ({
      source_key: `raw/${relativePath}#chunk-${String(index + 1).padStart(3, "0")}`,
      category: sharedMetadata.category || inferredMetadata.category || "general_reference",
      title: chunks.length > 1 ? `${title} (Chunk ${index + 1})` : title,
      content,
      metadata: {
        ...sharedMetadata,
        product_family: sidecarMetadata.product_family || inferredMetadata.product_family,
        vendor: sidecarMetadata.vendor || inferredMetadata.vendor,
        tags: Array.isArray(sidecarMetadata.tags) && sidecarMetadata.tags.length > 0 ? sidecarMetadata.tags : inferredMetadata.tags,
        chunk_index: index + 1,
        chunk_total: chunks.length,
        chunk_chars: content.length
      }
    }))
  };
}

export async function collectRawCandidateFiles(sourceFiles = null) {
  await ensureRawDirectory();
  let files = [];

  if (Array.isArray(sourceFiles) && sourceFiles.length > 0) {
    files = sourceFiles.map((relativePath) => path.join(rawDir, String(relativePath || "").replace(/\\/g, "/")));
  } else {
    files = await walkFiles(rawDir);
  }

  return files.filter((absolutePath) => {
    const extension = path.extname(absolutePath).toLowerCase();
    const normalizedBaseName = path.basename(absolutePath).toLowerCase();
    return (
      supportedExtensions.has(extension) &&
      !absolutePath.endsWith(".meta.json") &&
      normalizedBaseName !== "readme.md" &&
      !normalizedBaseName.startsWith(".")
    );
  });
}

export async function importRawDocuments(options = {}) {
  const normalizedOptions = {
    validateOnly: Boolean(options.validateOnly),
    chunkSize: Number(options.chunkSize) || 1600,
    chunkOverlap: Number(options.chunkOverlap) || 200,
    sourceFiles: Array.isArray(options.sourceFiles) ? options.sourceFiles : null,
    onProgress: typeof options.onProgress === "function" ? options.onProgress : null
  };
  const reportProgress = (patch) => {
    if (normalizedOptions.onProgress) {
      normalizedOptions.onProgress(patch);
    }
  };

  reportProgress({
    status: "running",
    stage: "scanning",
    progress_percent: 5,
    message: "Scanning raw documents"
  });
  const candidateFiles = await collectRawCandidateFiles(normalizedOptions.sourceFiles);
  const documents = [];

  for (let index = 0; index < candidateFiles.length; index += 1) {
    const absolutePath = candidateFiles[index];
    reportProgress({
      status: "running",
      stage: "parsing",
      progress_percent: candidateFiles.length === 0 ? 20 : 10 + Math.round(((index + 1) / candidateFiles.length) * 25),
      message: `Parsing ${path.basename(absolutePath)}`
    });
    const entry = await buildDocumentEntry(absolutePath, normalizedOptions).catch(err => {
      console.error(`[kb-import] failed to parse ${absolutePath}:`, err.message);
      return null;
    });
    if (entry) {
      documents.push(entry);
    }
  }

  const manifest = {
    generated_at: new Date().toISOString(),
    provider: hasEmbeddingConfig() ? config.embeddings.provider : "disabled",
    raw_file_count: candidateFiles.length,
    document_count: documents.length,
    chunk_count: documents.reduce((total, document) => total + document.chunks.length, 0),
    documents: documents.map((document) => ({
      source_file: document.relativePath,
      title: document.title,
      chunk_count: document.chunks.length
    }))
  };

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  reportProgress({
    status: "running",
    stage: "manifest",
    progress_percent: normalizedOptions.validateOnly || !hasEmbeddingConfig() ? 100 : 40,
    message: "Prepared document manifest"
  });

  if (normalizedOptions.validateOnly || !hasEmbeddingConfig()) {
    return { ok: true, mode: "validate-only", manifest };
  }

  const records = [];
  const totalChunks = documents.reduce((total, document) => total + document.chunks.length, 0);
  let processedChunks = 0;
  for (const document of documents) {
    for (
      let startIndex = 0;
      startIndex < document.chunks.length;
      startIndex += config.knowledgeImport.embeddingBatchSize
    ) {
      const batch = document.chunks.slice(startIndex, startIndex + config.knowledgeImport.embeddingBatchSize);
      processedChunks += batch.length;
      reportProgress({
        status: "running",
        stage: "embedding",
        progress_percent: totalChunks === 0 ? 85 : 40 + Math.round((processedChunks / totalChunks) * 45),
        message: `Embedding chunk ${processedChunks} of ${totalChunks}`
      });

      let embeddings;
      try {
        embeddings = await embedTexts(batch.map((chunk) => chunk.content));
      } catch (embErr) {
        throw new Error(`Embedding failed at chunk ${processedChunks}/${totalChunks}: ${embErr.message}`);
      }
      for (let index = 0; index < batch.length; index += 1) {
        records.push({
          ...batch[index],
          embedding: embeddings[index] ?? null
        });
      }
    }
  }

  reportProgress({
    status: "running",
    stage: "saving",
    progress_percent: 92,
    message: "Saving knowledge chunks to Supabase"
  });
  let savedCount = 0;
  for (let startIndex = 0; startIndex < records.length; startIndex += config.knowledgeImport.upsertBatchSize) {
    const batch = records.slice(startIndex, startIndex + config.knowledgeImport.upsertBatchSize);
    const result = await upsertKnowledgeBase(batch);
    savedCount += result.count ?? batch.length;
  }
  reportProgress({
    status: "completed",
    stage: "completed",
    progress_percent: 100,
    message: "Import completed"
  });
  return {
    ok: true,
    mode: "upserted",
    document_count: documents.length,
    chunk_count: records.length,
    saved_count: savedCount,
    manifest
  };
}
