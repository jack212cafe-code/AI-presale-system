# Technology Stack

**Analysis Date:** 2026-03-29

## Languages

**Primary:**
- JavaScript (ESM) - All application code (`server.js`, `lib/`, `agents/`, `knowledge_base/`)

**Secondary:**
- HTML/CSS - Static UI pages (`intake/index.html`, `admin/index.html`)

## Runtime

**Environment:**
- Node.js >=20.0.0 (required by `package.json` engines field)

**Package Manager:**
- npm (inferred from `package.json`)
- Lockfile: `package-lock.json` (expected; not verified)

**Module System:**
- ESM (`"type": "module"` in `package.json`) — all imports use `import/export` syntax

## Frameworks

**Core:**
- None — HTTP server built on Node.js built-in `node:http` (`server.js` line 2)

**Testing:**
- Node.js built-in test runner (`node --test`) — no external test framework
- Config: none; run via `npm test` or `npm run check`

**Build/Dev:**
- `node --watch` for dev mode (`npm run dev`)
- No bundler, no transpiler, no TypeScript

## Key Dependencies

**Critical:**
- `@supabase/supabase-js` ^2.57.4 — Supabase client for Postgres + pgvector (DB, knowledge base, agent logs, pricing catalog)
- `docx` ^9.5.1 — DOCX proposal document generation
- `dotenv` ^17.2.3 — Environment variable loading (`lib/config.js` line 1)

**No dev dependencies declared** — testing uses Node.js built-ins only.

## Configuration

**Environment:**
- Loaded via `dotenv/config` at startup
- Template: `.env.example` at project root
- Key vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `ADMIN_PORTAL_PASSWORD`, `N8N_REVIEW_WEBHOOK_URL`
- All config centralized in `lib/config.js`

**Build:**
- No build step; source runs directly with Node.js

## Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `npm run dev` | `node --watch server.js` | Dev server with file watching |
| `npm start` | `node server.js` | Production server |
| `npm test` | `node --test --test-isolation=none` | Run test suite |
| `npm run seed:kb` | `node knowledge_base/embed.js` | Seed knowledge base embeddings |
| `npm run smoke` | `node scripts/smoke.js` | Smoke tests |

## Platform Requirements

**Development:**
- Node.js >=20.0.0
- `.env` file populated from `.env.example`

**Production:**
- Any Node.js >=20 host (no platform-specific bindings)
- Supabase project with pgvector enabled
- OpenAI API access

---

*Stack analysis: 2026-03-29*
