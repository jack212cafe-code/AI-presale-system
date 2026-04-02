# Coding Conventions

**Analysis Date:** 2026-03-29

## Naming Patterns

**Files:**
- All lowercase with hyphens: `admin-auth.js`, `admin-kb.js`, `project-context.js`
- Agent files named after function: `discovery.js`, `solution.js`, `bom.js`, `proposal.js`
- Lib files named after domain: `validation.js`, `logging.js`, `intake.js`, `json.js`

**Functions:**
- camelCase throughout: `runDiscoveryAgent`, `sanitizeRequirements`, `buildMockBom`
- Agent entrypoints always prefixed `run`: `runDiscoveryAgent`, `runSolutionAgent`, `runBomAgent`, `runProposalAgent`
- Mock builders prefixed `buildMock`: `buildMockRequirements`, `buildMockSolution`, `buildMockBom`, `buildMockDraft`
- Sanitizers prefixed `sanitize`: `sanitizeRequirements`, `sanitizeSolution`, `sanitizeBomOutput`
- Normalizers prefixed `normalize`: `normalizeIntakePayload`, `normalizeKnowledgeUploadPayload`
- Validators prefixed `validate`: `validateIntakePayload`, `validateRequirements`, `validateSolution`, `validateBom`

**Variables:**
- camelCase for locals: `startedAt`, `pricingRows`, `outputDir`
- snake_case only in JSON payloads and Supabase field names: `customer_name`, `partner_type`, `agent_name`
- Constants named with UPPER_SNAKE_CASE for fixed sets: `HARDWARE_VENDORS`, `DEFAULT_NODE_COUNT`

**Exports:**
- Named exports only; no default exports used anywhere in the codebase

## Module System

- ES modules throughout (`"type": "module"` in `package.json`)
- `__dirname` reconstructed with `fileURLToPath` + `path.dirname` in every agent and Node context that needs it:
  ```js
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  ```
- Node built-ins imported with `node:` prefix: `import { readFile } from "node:fs/promises"`, `import path from "node:path"`

## Import Organization

**Order (consistent across all agent files):**
1. Node built-ins with `node:` prefix
2. Local lib imports (`../lib/...`)
3. Local knowledge base imports (`../knowledge_base/...`)

Example from `agents/discovery.js`:
```js
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "../lib/config.js";
import { withAgentLogging } from "../lib/logging.js";
import { generateJsonWithOpenAI } from "../lib/openai.js";
import { validateRequirements } from "../lib/validation.js";
```

## Async/Await

- All I/O is `async/await`; no callbacks or raw `.then()` chains
- Agent entrypoints are all `async function`
- Logging wrapper `withAgentLogging` takes a sync runner factory `() => promise` to time execution cleanly
- Error propagation: `withAgentLogging` logs failure then re-throws; callers catch at the HTTP handler level
- Retry logic is recursive async: `generateJsonWithOpenAI` calls itself with `attempt + 1` up to 3 times on token-limit truncation

## Mock vs Live Mode

**Toggle mechanism** (`lib/config.js` line 16):
```js
forceLocalMode: process.env.AI_PRESALE_FORCE_LOCAL === "1"
```

**Guard functions** in `lib/config.js`:
- `hasOpenAi()` — returns `false` when `forceLocalMode` is true or `OPENAI_API_KEY` is absent
- `hasSupabaseAdmin()` — returns `false` when `forceLocalMode` is true or Supabase credentials absent
- `hasSupabasePublic()` — same pattern
- `hasEmbeddingConfig()` — same pattern

**How agents use it** (`lib/openai.js` line 55-62):
```js
if (!hasOpenAi()) {
  return {
    output: await mockResponseFactory(),
    usage: { input_tokens: 0, output_tokens: 0 },
    model: "mock",
    mock: true
  };
}
```

Every agent passes a `mockResponseFactory` to `generateJsonWithOpenAI`. In tests, `AI_PRESALE_FORCE_LOCAL=1` is set at the top of `test/scaffold.test.js` before any imports, ensuring all agents return mock output.

Mock output is also used as fallback when OpenAI returns unparseable JSON after max retries.

## JSON Validation and Sanitization Pattern

Each agent follows a strict three-step pipeline:

**Step 1 — Sanitize** (agent-local function):
- Defensively reads each field using `?? fallback` or `|| default`
- Uses shared `toArray(value)` helper (duplicated in each agent) to normalize any array field:
  ```js
  function toArray(value) {
    if (Array.isArray(value)) {
      return value.filter((item) => item !== null && item !== undefined && String(item).trim() !== "");
    }
    if (value === null || value === undefined || value === "") return [];
    return [String(value).trim()];
  }
  ```
- Numeric fields forced with `Number(...)`: `qty`, `unit_price`, `total_price`
- String fields forced with `String(...).trim()`

**Step 2 — Validate** (`lib/validation.js`):
- Custom `assert(condition, message)` helper throws `Error` with the message on failure
- One validator per agent output type: `validateRequirements`, `validateSolution`, `validateBom`, `validateProposalMetadata`
- Validators check shape (object/array) and required fields; they do not coerce values

**Step 3 — JSON Schema enforcement** (OpenAI `text.format`):
- Each agent defines a `*TextFormat` object with `type: "json_schema"`, `strict: true`, and `additionalProperties: false`
- This is passed as `textFormat` to `generateJsonWithOpenAI` for server-side schema enforcement at the LLM level

**Raw LLM output parsing** (`lib/json.js`):
- `safeParseJson(rawText)` attempts `JSON.parse` first
- Falls back to regex extraction of `{...}` or `[...]` block
- Falls back to `findBalancedJson` bracket-walking algorithm
- Returns `{ ok: boolean, value?, error? }` result object — never throws

## Error Handling

- `assert(condition, message)` pattern in `lib/validation.js` — throws `Error` directly (no custom error classes)
- HTTP handlers return `{ ok: false, error: string }` with appropriate 4xx/5xx status
- Agent logging errors are swallowed via `writeAgentLogSafely` with `console.warn` — never block the pipeline
- OpenAI HTTP errors throw immediately: `throw new Error(\`OpenAI request failed with status ${response.status}: ...\`)`
- `console.warn` used for non-fatal degradation (vector retrieval fallback, log write failure)
- `console.error` not observed; `console.warn` is the degradation signal

## Code Style

- No linting config file detected (no `.eslintrc`, `biome.json`, etc.)
- Consistent 2-space indentation
- Trailing commas in multi-line object/array literals
- Arrow functions for short helpers; named `function` declarations for all exported and agent-level functions
- No semicolons omitted — semicolons used consistently
- Template literals used for dynamic strings; no string concatenation with `+` for multi-part strings

---

*Convention analysis: 2026-03-29*
