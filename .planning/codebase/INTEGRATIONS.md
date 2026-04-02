# External Integrations

**Analysis Date:** 2026-03-29

## APIs & External Services

**OpenAI:**
- Used for LLM inference (discovery, solution, BOM, proposal agents) and text embeddings
- API: OpenAI Responses API (`https://api.openai.com/v1/responses`)
- Embeddings API: `https://api.openai.com/v1/embeddings`
- Auth: Bearer token via `OPENAI_API_KEY`
- Owner: `lib/openai.js` — `generateJsonWithOpenAI()`, `embedQuery()`
- Models configured per-agent via env vars (see config section below)
- Default output format: `json_object`; retries up to 3x on `max_output_tokens` truncation

**n8n:**
- Receives outbound webhook calls for human review notifications
- Integration: HTTP POST to `N8N_REVIEW_WEBHOOK_URL`
- Auth: URL-based (no additional auth headers observed)
- Owner: `lib/config.js` (`config.n8n.reviewWebhookUrl`); webhook dispatch not yet wired in observed code (configured but unused in `server.js`)

## Data Storage

**Databases:**
- Supabase Postgres + pgvector
  - URL: `SUPABASE_URL`
  - Admin client (service role): `SUPABASE_SERVICE_ROLE_KEY` — used for all write operations
  - Public client (anon): `SUPABASE_ANON_KEY` — available but minimal use observed
  - Owner: `lib/supabase.js`
  - Tables accessed: `agent_logs`, `knowledge_base`, `pricing_catalog`, `projects` (via `lib/projects.js`)
  - Vector search: `match_knowledge_base` RPC function (pgvector cosine similarity)
  - Fallback: if RPC returns empty, performs in-process cosine similarity over full `knowledge_base` table rows

**File Storage:**
- Local filesystem — raw knowledge documents saved to disk via `knowledge_base/raw-import-lib.js`

**Caching:**
- None

## Authentication & Identity

**Admin Portal:**
- Password-based session auth
- Password: `ADMIN_PORTAL_PASSWORD`
- Sessions: in-memory token store
- Owner: `lib/admin-auth.js`
- Cookie-based session (`Set-Cookie` header)

**No end-user auth** — intake form is unauthenticated.

## Monitoring & Observability

**Agent Logs:**
- Every LLM call logged to `agent_logs` table in Supabase via `lib/supabase.js` `writeAgentLog()`
- Fallback: if Supabase unavailable, log is silently skipped (`{ saved: false }`)

**Error Tracking:**
- None (no Sentry, Datadog, etc.)

**Logs:**
- `console.log` only; no structured logging library

## CI/CD & Deployment

**Hosting:**
- Not configured in codebase (no Dockerfile, no platform config detected)

**CI Pipeline:**
- None detected

## Environment Configuration

**Required env vars:**
| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (admin writes) |
| `OPENAI_API_KEY` | OpenAI API access |
| `ADMIN_PORTAL_PASSWORD` | Admin UI password |
| `N8N_REVIEW_WEBHOOK_URL` | n8n webhook for review notifications |

**Optional env vars:**
| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | HTTP listen port |
| `PUBLIC_BASE_URL` | `http://localhost:3000` | Base URL for URL construction |
| `OPENAI_MODEL_DISCOVERY` | `gpt-5-mini` | Model for discovery agent |
| `OPENAI_MODEL_SOLUTION` | `gpt-5-mini` | Model for solution agent |
| `OPENAI_MODEL_BOM` | `gpt-5-mini` | Model for BOM agent |
| `OPENAI_MODEL_PROPOSAL` | `gpt-5-mini` | Model for proposal agent |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model |
| `EMBEDDING_PROVIDER` | `openai` | Embedding provider (only `openai` supported) |
| `KB_IMPORT_MAX_FILE_SIZE_MB` | `30` | Max KB upload file size |
| `KB_IMPORT_MAX_CHUNKS_PER_DOCUMENT` | `400` | Max chunks per document |
| `KB_IMPORT_EMBED_BATCH_SIZE` | `20` | Embedding batch size |
| `KB_IMPORT_UPSERT_BATCH_SIZE` | `100` | Supabase upsert batch size |
| `AI_PRESALE_FORCE_LOCAL` | `0` | Set to `1` to disable all external calls |

**Secrets location:**
- `.env` file at project root (not committed); template at `.env.example`

## Mock / Local Mode

**Force local mode:**
- Set `AI_PRESALE_FORCE_LOCAL=1` to disable all external integrations
- `lib/config.js` exports `hasOpenAi()`, `hasSupabaseAdmin()`, `hasSupabasePublic()`, `hasEmbeddingConfig()` — all return `false` when force-local is active
- `lib/openai.js` `generateJsonWithOpenAI()` accepts a `mockResponseFactory` callback; called instead of OpenAI when `hasOpenAi()` is false
- `lib/supabase.js` functions return `{ saved: false }` or `[]` when no Supabase client is available
- Health endpoint (`GET /health`) reports `mode: "local"` vs `"integrated"` based on Supabase availability

## Webhooks & Callbacks

**Incoming:**
- None (no inbound webhook endpoints in `server.js`)

**Outgoing:**
- `N8N_REVIEW_WEBHOOK_URL` — configured for n8n review notifications; dispatch implementation not yet present in observed routes

---

*Integration audit: 2026-03-29*
