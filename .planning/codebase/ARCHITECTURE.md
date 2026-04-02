# Architecture

**Analysis Date:** 2026-03-29

## Pattern Overview

**Overall:** Sequential multi-agent pipeline with dual-mode execution (mock/live)

**Key Characteristics:**
- Each agent is a pure async function that accepts structured JSON and returns structured JSON
- All LLM calls are wrapped in `withAgentLogging` which writes to `agent_logs` in Supabase
- When credentials are absent (`OPENAI_API_KEY`, `SUPABASE_URL`), every agent falls back to a deterministic `mockResponseFactory`
- Project state is stored progressively in the `projects` table — each pipeline stage writes its JSON output to a dedicated column
- Proposal delivery is gated behind `human_approved = true` on the project record

## Agent Pipeline

**Stage 1 — Intake:**
- Entry: `POST /api/intake` or `POST /api/intake/analyze`
- Handler: `lib/intake.js` → `normalizeIntakePayload()` validates and coerces form fields
- Persists: `projects.intake_json`, sets `status = 'intake'`
- Key file: `lib/intake.js`

**Stage 2 — Discovery:**
- Function: `runDiscoveryAgent(intake, { projectId })` in `agents/discovery.js`
- Prompt: `agents/_prompts/discovery.md`
- Input: normalized intake payload
- Output schema: `discovery_requirements` (JSON Schema, strict mode)
- Persists: `projects.requirements_json`, sets `status = 'discovery_complete'`
- Mock: `buildMockRequirements(intake)` — derives use_cases by keyword matching on `primary_use_case + notes`
- Post-process: `sanitizeRequirements()` → `validateRequirements()`

**Stage 3 — Solution Design:**
- Function: `runSolutionAgent(requirements, { projectId })` in `agents/solution.js`
- Prompt: `agents/_prompts/solution.md`
- Input: requirements JSON + top-5 knowledge chunks
- Knowledge retrieval: vector search via `match_knowledge_base` RPC if Supabase + embedding available; falls back to `retrieveLocalKnowledge()` keyword scoring against `knowledge_base/seed/` files
- Output schema: `solution_options` (array of options with `vendor_stack`, `rationale`, `risks`, `estimated_tco_thb`)
- Persists: `projects.solution_json`, sets `status = 'solution_complete'`
- Mock: `buildMockSolution()` — selects HCI/Backup or 3-Tier/DR based on use_case keywords

**Stage 4 — BOM Generation:**
- Function: `runBomAgent(solution, { projectId, requirements })` in `agents/bom.js`
- Prompt: `agents/_prompts/bom.md`
- Input: `selected_option` from solution + pricing rows from `pricing_catalog` table
- Pricing lookup: `getPricingRowsByVendors(vendor_stack)` in `lib/supabase.js`; falls back to hardcoded `fallbackCatalog` in `agents/bom.js`
- Output schema: `bom_rows` (rows with `part_number`, `qty`, `unit_price`, `total_price`, `subtotal`)
- Persists: `projects.bom_json`
- Mock: `buildMockBom()` — maps vendor_stack to fallback catalog, uses `scale.node_count` for hardware qty

**Stage 5 — Proposal:**
- Function: `runProposalAgent(project, requirements, solution, bom, { projectId })` in `agents/proposal.js`
- Prompt: `agents/_prompts/proposal.md`
- Input: all prior pipeline outputs
- Gate: checks `projects.human_approved` — throws if not approved when `projectId` is provided
- Output: `.docx` file written to `output/` directory via `lib/proposal.js` → `docx` library
- Persists: `projects.proposal_url` (filesystem path), resets `human_approved = false`
- Mock: `buildMockDraft()` — returns static executive_summary and solution_overview strings

## Dual-Mode Execution (Mock/Live)

**Decision logic in `lib/openai.js` → `generateJsonWithOpenAI()`:**
```
if (!hasOpenAi()) → call mockResponseFactory() directly, return { output, model: "mock" }
else → call OpenAI Responses API → parse JSON → on parse failure, retry with 2x tokens (max 3 attempts) → on persistent failure, call mockResponseFactory()
```

**Decision logic for knowledge retrieval in `agents/solution.js` → `getKnowledge()`:**
```
if (hasSupabaseAdmin() && hasEmbeddingConfig()) → embedQuery() → retrieveKnowledgeFromVector() (top-5)
else → retrieveLocalKnowledge() from knowledge_base/seed/ (keyword scoring, top-5)
```

**Config guards in `lib/config.js`:**
- `hasOpenAi()` — returns false if `OPENAI_API_KEY` missing or `AI_PRESALE_FORCE_LOCAL=1`
- `hasSupabaseAdmin()` — returns false if `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` missing
- `hasEmbeddingConfig()` — returns false if provider is not `openai` or key missing

## `withAgentLogging` Pattern

All four agent functions wrap their LLM call with `withAgentLogging` from `lib/logging.js`:

```javascript
const output = await withAgentLogging(
  { agentName, projectId, modelUsed, input },
  () => generateJsonWithOpenAI({ ... })
);
```

- On success: writes `status = 'success'`, `tokens_used`, `duration_ms`, `input_json`, `output_json` to `agent_logs`
- On error: writes `status = 'error'`, re-throws so the HTTP handler returns 400
- Log writes are non-fatal — wrapped in `writeAgentLogSafely()` which swallows errors

## Data Flow

**HTTP-triggered single-agent flow:**
1. `POST /api/intake/analyze` → `normalizeIntakePayload()` → `createProjectRecord()` → `runDiscoveryAgent()` → `persistRequirementsJson()` → response

**HTTP-triggered solution flow:**
1. `POST /api/solution` → `getProjectById()` → guard: `requirements_json` must exist → `runSolutionAgent()` → response

**Script-triggered full pipeline flow (`scripts/complete-proposal-flow.js`):**
1. `normalizeIntakePayload()` → `createProjectRecord()` → `runDiscoveryAgent()` → `runSolutionAgent()` → `runBomAgent()` → `runProposalAgent()` → `.docx` written to `output/`

**Human approval flow:**
1. `POST /api/projects/:id/approve` → `approveProject()` sets `human_approved = true`
2. Subsequent `runProposalAgent()` call proceeds past the gate

## Database Schema

**`projects` table:**
- `id` uuid PK
- `customer_name` text
- `status` text — lifecycle: `intake` → `discovery_complete` → `solution_complete`
- `intake_json` jsonb — raw normalized intake payload
- `requirements_json` jsonb — discovery agent output
- `solution_json` jsonb — solution agent output
- `bom_json` jsonb — BOM agent output
- `proposal_url` text — filesystem path to generated `.docx`
- `human_approved` boolean (default false) — gate for proposal delivery

**`knowledge_base` table:**
- `source_key` text unique — format: `seed/<filename>` or `raw/<relative_path>#chunk-NNN`
- `category` text — taxonomy: `presale_playbook`, `platform_architecture`, `backup_strategy`, `dr_strategy`, `security_architecture`, `devops_platform`, `network_architecture`, `commercial_rule`, `general_reference`
- `embedding` vector(1536) — OpenAI `text-embedding-3-small`
- RPC: `match_knowledge_base(query_embedding, match_count)` — cosine similarity via `ivfflat` index

**`pricing_catalog` table:**
- `vendor`, `part_number`, `description`, `unit_price`, `currency`
- Used by BOM agent for live pricing lookup; seeded via `scripts/seed-pricing.js`

**`agent_logs` table:**
- `project_id` uuid FK → projects (nullable)
- `agent_name`, `model_used`, `tokens_used`, `duration_ms`, `status`, `input_json`, `output_json`
- Every LLM call writes one row

## Error Handling

**Strategy:** Fail-fast at validation, non-fatal logging, mock fallback for LLM failures

**Patterns:**
- `lib/validation.js` — all agent outputs pass through `validateRequirements()`, `validateSolution()`, `validateBom()`, `validateProposalMetadata()` which throw on structural violations
- `lib/intake.js` → `validateIntakePayload()` throws on missing required fields before any LLM call
- `lib/json.js` → `safeParseJson()` — three-pass JSON extraction (direct parse → regex extract → balanced-bracket scan) before triggering retry
- HTTP layer: all errors caught in route handlers, returned as `{ ok: false, error: message }` with 400/404/500

## Knowledge Base Import Pipeline

**Managed by `knowledge_base/raw-import-lib.js`:**
1. Upload: `POST /api/admin/kb/upload` → saves `.docx`/`.pdf`/`.md`/etc. to `knowledge_base/raw/uploads/` with sidecar `.meta.json`
2. Job tracking: `lib/admin-jobs.js` — in-memory Map, max 100 jobs, polled via `GET /api/admin/kb/jobs/:id`
3. Import: `importRawDocuments()` → extract text (pdf-parse, mammoth, xlsx) → `chunkText()` (1600 chars, 200 overlap) → `embedTexts()` batch → `upsertKnowledgeBase()` batch
4. Seed knowledge: `knowledge_base/seed/` markdown files — loaded at runtime by `retrieveLocalKnowledge()` without embedding

## Admin Portal

**Authentication:** Cookie-based session (12h TTL), in-memory Map, SHA-256 password comparison with `timingSafeEqual`
**Routes:** `/admin` static HTML + `/api/admin/*` endpoints for login, KB document list, upload, delete

---

*Architecture analysis: 2026-03-29*
