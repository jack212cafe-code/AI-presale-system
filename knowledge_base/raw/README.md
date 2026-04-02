# Raw Knowledge Import

Put source documents here when you want to import real knowledge into the RAG store.

Supported file types:

- `.pdf`
- `.docx`
- `.xlsx`
- `.md`
- `.txt`
- `.json`
- `.csv`

Recommended folder pattern:

```text
knowledge_base/raw/
  nutanix/
    datasheet-nutanix-cluster.pdf
    datasheet-nutanix-cluster.pdf.meta.json
  veeam/
    best-practice-immutable-backup.docx
  catalog/
    q2-product-catalog.xlsx
```

Optional sidecar metadata:

Create a file with the same original name plus `.meta.json`.

Example:

```json
{
  "title": "Nutanix Cluster Datasheet",
  "vendor": "Nutanix",
  "product_family": "Nutanix HCI",
  "document_type": "datasheet",
  "category": "platform_architecture",
  "revision_date": "2026-03-15",
  "trust_level": "vendor_official",
  "tags": ["hci", "datasheet", "cluster"]
}
```

Import flow:

1. Install parser dependencies:
   `npm install --no-save --prefix .kb-import-deps pdf-parse mammoth xlsx`
2. Validate parsing and chunk counts:
   `node knowledge_base/import-raw.js --validate-only`
3. Import and embed into Supabase:
   `node knowledge_base/import-raw.js`

Notes:

- The importer creates one `knowledge_base` row per chunk.
- `source_key` is generated as `raw/<relative-path>#chunk-###`.
- If a document changes and you re-import it, matching `source_key` values will be upserted.
