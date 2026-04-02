# Codebase Structure

**Analysis Date:** 2026-03-29

## Directory Layout

```
AI-presale-system/
├── server.js                    # HTTP server entry point (Node http module, no framework)
├── package.json                 # ESM project, Node >= 20, dependencies: @supabase/supabase-js, docx, dotenv
├── agents/                      # LLM agent functions (one file per pipeline stage)
│   ├── discovery.js             # Stage 2: intake → requirements_json
│   ├── solution.js              # Stage 3: requirements_json → solution_json
│   ├── bom.js                   # Stage 4: solution_json → bom_json
│   ├── proposal.js              # Stage 5: all prior outputs → .docx file
│   └── _prompts/                # System prompt files loaded at runtime
│       ├── discovery.md
│       ├── solution.md
│       ├── bom.md
│       └── proposal.md
├── lib/                         # Shared infrastructure modules
│   ├── config.js                # env var loading, feature flags (hasOpenAi, hasSupabaseAdmin, etc.)
│   ├── supabase.js              # Supabase client factory, all DB operations
│   ├── projects.js              # Project CRUD: create, persist per-stage JSON, approve
│   ├── openai.js                # generateJsonWithOpenAI(), embedQuery()
│   ├── logging.js               # withAgentLogging() wrapper
│   ├── validation.js            # validateIntakePayload, validateRequirements, validateSolution, validateBom, validateProposalMetadata
│   ├── intake.js                # normalizeIntakePayload() — coerces and validates form input
│   ├── proposal.js              # buildProposalBuffer() — docx document builder
│   ├── project-context.js       # formatProjectObjective() — injected into every system prompt
│   ├── json.js                  # safeParseJson() — robust JSON extraction with fallback
│   ├── admin-auth.js            # Cookie session management (in-memory Map)
│   ├── admin-jobs.js            # Background job tracking (in-memory Map, max 100 jobs)
│   └── admin-kb.js              # normalizeKnowledgeUploadPayload(), normalizeKnowledgeDeletePayload()
├── knowledge_base/
│   ├── shared.js                # chunkText(), inferMetadata(), loadSeedEntries(), retrieveLocalKnowledge()
│   ├── raw-import-lib.js        # importRawDocuments(), saveUploadedRawDocument(), deleteRawDocumentFiles()
│   ├── embed.js                 # CLI: seed KB embeddings to Supabase
│   ├── import-raw.js            # CLI: import raw document files
│   ├── seed-manifest.json       # Manifest of seeded knowledge entries
│   ├── seed/                    # Markdown knowledge articles (loaded at runtime as local fallback)
│   │   ├── hci-sizing.md
│   │   ├── dr-tier-mapping.md
│   │   ├── backup-immutability.md
│   │   ├── vendor-nutanix-hci-presale-guide.md
│   │   ├── vendor-veeam-data-protection-guide.md
│   │   └── ... (35 total seed files)
│   └── raw/
│       └── uploads/             # Uploaded raw documents (.pdf, .docx, etc.) + .meta.json sidecars
├── intake/
│   ├── index.html               # Customer intake form (served at GET /)
│   └── submit.js                # Browser-side form submission script
├── admin/
│   ├── index.html               # Admin portal (served at GET /admin)
│   └── admin.js                 # Browser-side admin UI script
├── scripts/                     # One-off CLI scripts (run with `node scripts/<file>.js`)
│   ├── complete-proposal-flow.js  # Full pipeline smoke test: intake → discovery → solution → BOM → proposal
│   ├── complete-bom-flow.js       # Partial pipeline: intake → discovery → solution → BOM
│   ├── smoke.js                   # Basic connectivity check
│   ├── check-env.js               # Validates env vars
│   ├── check-supabase-schema.js   # Validates DB schema against expected tables
│   ├── seed-pricing.js            # Seeds pricing_catalog table
│   └── evaluate-kb.js             # Evaluates knowledge base retrieval quality
├── supabase/
│   └── schema.sql               # DB schema: projects, knowledge_base, pricing_catalog, agent_logs
├── test/
│   ├── scaffold.test.js         # Node --test based test file
│   └── fixtures/                # JSON test scenarios
│       ├── scenario_hci.json
│       ├── scenario_backup.json
│       ├── scenario_dr.json
│       ├── scenario_multi_agent_saas.json
│       ├── scenario_incomplete_brief.json
│       └── scenario_conflicting_brief.json
├── output/                      # Generated .docx proposal files (gitignored except .gitkeep)
├── n8n/
│   └── workflow.json            # n8n starter workflow skeleton
├── templates/
│   └── README.md                # Guidance only — proposals are generated in code, not from templates
└── .planning/
    └── codebase/                # GSD analysis documents
```

## Directory Purposes

**`agents/`:**
- Purpose: One file per pipeline stage. Each exports a single `run*Agent()` async function.
- Pattern: load prompt from `_prompts/`, call `withAgentLogging()`, call `generateJsonWithOpenAI()` with `mockResponseFactory`, sanitize output, validate output, optionally persist to DB.
- Key files: `agents/discovery.js`, `agents/solution.js`, `agents/bom.js`, `agents/proposal.js`

**`agents/_prompts/`:**
- Purpose: System prompt markdown files, loaded at runtime via `readFile()`.
- Rule: All prompts live here. Never inline prompts in agent JS files.

**`lib/`:**
- Purpose: Shared infrastructure. No business logic, no pipeline sequencing.
- Module boundaries:
  - `config.js` — only source of env vars; all other modules import from here
  - `supabase.js` — only file that calls `@supabase/supabase-js`; exports typed operations
  - `openai.js` — only file that calls OpenAI API directly
  - `logging.js` — only file that calls `writeAgentLog`; agents must not call supabase directly
  - `projects.js` — all `projects` table mutations; agents import from here, not from `supabase.js`
  - `validation.js` — all structural validation; returns the validated value or throws

**`knowledge_base/`:**
- Purpose: Knowledge ingestion pipeline and local fallback retrieval.
- `shared.js` — runtime utilities usable by agents without importing `raw-import-lib.js`
- `raw-import-lib.js` — heavy import pipeline; uses optional deps from `.kb-import-deps/`
- `seed/` — 35 markdown articles covering HCI, DR, backup, security, network, vendor guides; loaded by `retrieveLocalKnowledge()` at agent runtime when Supabase/embeddings are unavailable

**`scripts/`:**
- Purpose: Developer CLI tools and end-to-end pipeline runners. Not part of the server.
- `complete-proposal-flow.js` is the canonical reference for how agents are wired together.

**`supabase/`:**
- Purpose: Schema definition only. Apply with Supabase SQL editor or `psql`.

**`test/fixtures/`:**
- Purpose: Canonical test inputs. Each fixture is a complete intake payload JSON for one scenario.
- Used by `test/scaffold.test.js` and can be passed directly to `normalizeIntakePayload()`.

**`output/`:**
- Purpose: Generated `.docx` files. Path is `output/<customer-name-slug>-proposal.docx`.
- Not committed (except `.gitkeep`). Path stored in `projects.proposal_url`.

**`.kb-import-deps/`:**
- Purpose: Isolated `node_modules` for optional document parsers (`pdf-parse`, `mammoth`, `xlsx`).
- Loaded via `createRequire()` in `raw-import-lib.js`. Install with `npm install --no-save --prefix .kb-import-deps pdf-parse mammoth xlsx`.

## Key File Locations

**Entry Points:**
- `server.js` — HTTP server; exports `appHandler` and `createAppServer`; self-starts if run as main module
- `scripts/complete-proposal-flow.js` — full pipeline CLI runner

**Configuration:**
- `lib/config.js` — all env vars; feature flag functions (`hasOpenAi()`, `hasSupabaseAdmin()`, `hasEmbeddingConfig()`)
- `.env.example` — documents required env vars (never read `.env` directly)

**Core Pipeline:**
- `agents/discovery.js` — `runDiscoveryAgent(intake, options)`
- `agents/solution.js` — `runSolutionAgent(requirements, options)`
- `agents/bom.js` — `runBomAgent(solution, options)`
- `agents/proposal.js` — `runProposalAgent(project, requirements, solution, bom, options)`

**Infrastructure:**
- `lib/openai.js` — `generateJsonWithOpenAI()`, `embedQuery()`
- `lib/logging.js` — `withAgentLogging()`
- `lib/supabase.js` — `getSupabaseAdmin()`, `retrieveKnowledgeFromVector()`, `getPricingRowsByVendors()`, `upsertKnowledgeBase()`, `writeAgentLog()`
- `lib/projects.js` — `createProjectRecord()`, `persistRequirementsJson()`, `persistSolutionJson()`, `persistBomJson()`, `persistProposalMetadata()`, `approveProject()`, `getProjectById()`
- `lib/validation.js` — all schema validators

**Knowledge Base:**
- `knowledge_base/shared.js` — `retrieveLocalKnowledge()`, `chunkText()`, `inferMetadata()`
- `knowledge_base/raw-import-lib.js` — `importRawDocuments()`, `saveUploadedRawDocument()`
- `knowledge_base/seed/` — 35 markdown seed articles

**Database:**
- `supabase/schema.sql` — tables, indexes, `match_knowledge_base` RPC function

**Testing:**
- `test/scaffold.test.js` — Node built-in test runner
- `test/fixtures/*.json` — scenario intake payloads

## Naming Conventions

**Files:**
- `agents/` — verb-noun: `discovery.js`, `solution.js`, `bom.js`, `proposal.js`
- `lib/` — noun or noun-noun: `config.js`, `admin-auth.js`, `admin-jobs.js`
- `knowledge_base/seed/` — kebab-case descriptive: `vendor-nutanix-hci-presale-guide.md`, `playbook-presale-discovery-and-qualification.md`
- `scripts/` — verb-noun: `complete-proposal-flow.js`, `seed-pricing.js`

**Exports:**
- Agents export a single named `run*Agent()` function
- `lib/` modules export named functions only (no default exports)
- `lib/config.js` exports `config` object plus named guard functions

## Where to Add New Code

**New agent stage:**
- Implementation: `agents/<stage-name>.js` — export `run<StageName>Agent()`
- Prompt: `agents/_prompts/<stage-name>.md`
- Validation: add `validate<StageName>()` to `lib/validation.js`
- DB persistence: add `persist<StageName>Json()` to `lib/projects.js` if a new column is needed
- Schema: add column to `projects` table in `supabase/schema.sql`

**New API endpoint:**
- Add route handler in `server.js` → `appHandler()` function
- Normalize/validate input in a new `lib/<feature>.js` module or reuse existing
- Do not put business logic in `server.js` — delegate to `lib/` or `agents/`

**New knowledge seed article:**
- Add `.md` file to `knowledge_base/seed/`
- File is auto-discovered by `loadSeedEntries()` at runtime
- Category inferred from filename/content via `taxonomyRules` in `knowledge_base/shared.js`

**New test scenario:**
- Add JSON fixture to `test/fixtures/scenario_<name>.json`
- Structure must be a valid intake payload matching `lib/intake.js` → `normalizeIntakePayload()` fields

**New utility:**
- Pure helper functions: `lib/<name>.js`
- If it touches Supabase: add to `lib/supabase.js`
- If it touches the `projects` table: add to `lib/projects.js`
- Never call `@supabase/supabase-js` directly from agents or scripts — use `lib/supabase.js`

## Special Directories

**`output/`:**
- Purpose: Generated `.docx` files
- Generated: Yes, at runtime by `runProposalAgent()`
- Committed: No (only `.gitkeep`)

**`.kb-import-deps/`:**
- Purpose: Isolated node_modules for optional KB parsers
- Generated: Yes, manually via `npm install --prefix`
- Committed: No

**`.planning/codebase/`:**
- Purpose: GSD architecture analysis documents
- Generated: Yes, by GSD map-codebase command
- Committed: Yes

**`knowledge_base/seed/`:**
- Purpose: Seed knowledge articles for local fallback retrieval
- Generated: No — hand-authored markdown
- Committed: Yes

**`knowledge_base/raw/uploads/`:**
- Purpose: Uploaded raw documents pending KB import
- Generated: Yes, at runtime via admin upload API
- Committed: No (PDFs present in repo are examples)

---

*Structure analysis: 2026-03-29*
