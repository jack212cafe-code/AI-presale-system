import path from "node:path";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeTags(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeKnowledgeUploadPayload(payload) {
  assert(payload && typeof payload === "object", "Upload payload must be an object");

  const file_name = String(payload.file_name || "").trim();
  const extension = path.extname(file_name).toLowerCase();

  assert(file_name, "file_name is required");
  assert(payload.content_base64, "content_base64 is required");
  assert(extension, "Uploaded file must include an extension");

  return {
    file_name,
    content_base64: String(payload.content_base64),
    metadata: {
      title: String(payload.title || "").trim() || undefined,
      vendor: String(payload.vendor || "").trim() || undefined,
      product_family: String(payload.product_family || "").trim() || undefined,
      document_type: String(payload.document_type || "").trim() || undefined,
      category: String(payload.category || "").trim() || undefined,
      revision_date: String(payload.revision_date || "").trim() || undefined,
      trust_level: String(payload.trust_level || "").trim() || undefined,
      tags: normalizeTags(payload.tags)
    }
  };
}

export function normalizeKnowledgeDeletePayload(payload) {
  assert(payload && typeof payload === "object", "Delete payload must be an object");
  const source_file = String(payload.source_file || "").trim().replace(/\\/g, "/");
  assert(source_file, "source_file is required");
  assert(!source_file.includes(".."), "source_file is invalid");
  return { source_file };
}
