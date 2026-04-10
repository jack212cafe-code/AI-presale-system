# AI Presale System

Phase 1 scaffold for a one-person AI-native presale workflow covering intake, discovery, solution design, BOM generation, proposal drafting, and human approval.

## What is included

- Node-based local runtime with a simple intake form and API
- Supabase schema for `projects`, `knowledge_base`, `pricing_catalog`, and `agent_logs`
- Seed loader for the knowledge base
- Agent modules for discovery, solution design, BOM generation, and proposal drafting
- Offline/mock execution path so the scaffold can be tested before API keys are configured
- Test fixtures and a smoke runner for end-to-end local validation
- Starter n8n workflow export placeholder

## Quick start

```bash
npm install
copy .env.example .env
npm test
npm run smoke -- --mock test/fixtures/scenario_hci.json
npm run dev
```

Open `http://localhost:3000` for the intake form.
Open `http://localhost:3000/admin` for the knowledge admin portal.

## Environment

This scaffold runs in two modes:

- Local/mock mode: no external credentials required; useful for flow validation and tests
- Integrated mode: add Supabase and OpenAI credentials in `.env`

Required for integrated mode:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `OPENAI_API_KEY` for KB embeddings

## Structure

```text
AI-presale-system/
  agents/
  intake/
  knowledge_base/
  lib/
  n8n/
  output/
  scripts/
  supabase/
  templates/
  test/
  CLAUDE.md
  server.js
```

## Notes

- The proposal generator creates `.docx` files programmatically with `docx`; no binary template is checked in yet.
- `knowledge_base/embed.js` can validate seed files without external credentials and can upsert embeddings once Supabase and OpenAI are configured.
- `knowledge_base/import-raw.js` imports real documents from `knowledge_base/raw/`, chunks them, adds metadata, and upserts them into the KB.
- The current n8n workflow is a safe starter export, not a final production workflow.
- `scripts/smoke.js` accepts `--mock` to force local mode even when real credentials are present.

## Import real knowledge documents

Use this when you want to ingest datasheets, best practices, user guides, and product catalogs.

1. Install raw-document parsers:
   `npm install --no-save --prefix .kb-import-deps pdf-parse mammoth xlsx`
2. Put files under `knowledge_base/raw/`
3. Optionally add per-file metadata sidecars with `.meta.json`
4. Validate parsing and chunking:
   `node knowledge_base/import-raw.js --validate-only`
5. Import + embed into Supabase:
   `node knowledge_base/import-raw.js`

Supported raw formats:

- `pdf`
- `docx`
- `xlsx`
- `md`
- `txt`
- `json`
- `csv`

## Knowledge admin portal

Use the admin portal when you want a non-technical upload flow:

1. Start the server with `npm run dev` or `node server.js`
2. Set `ADMIN_PORTAL_PASSWORD` in `.env`
3. Open `http://localhost:3000/admin`
4. Login with the admin password
5. Choose a document from your computer
6. Fill optional metadata such as vendor or document type
7. Click `Import document`
8. Watch the progress bar while the server parses, embeds, and saves the document
9. Review imported documents in the list and delete any document you no longer want in the KB

Current import guardrails:

- Default max file size: `30 MB`
- Default max chunks per document: `400`
- Very large PDFs such as full user guides should be split into smaller sections before import
