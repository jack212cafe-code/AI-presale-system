# Commercial Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 blocking issues that prevent the AI Presale System from being sold commercially, sorted Wave 1→3 by impact (highest first).

**Architecture:** Three independent waves — each wave is deployable on its own. Wave 1 patches the most critical auth/credential attack surface. Wave 2 makes rate-limiting durable across restarts. Wave 3 adds cost guard and error observability.

**Tech Stack:** Node.js ESM, Supabase Postgres, existing `lib/rate-limit.js`, existing `lib/config.js`, `lib/user-auth.js`, `lib/openai.js`, Sentry (`@sentry/node`).

---

## Manual Pre-Work (not code — do these FIRST)

These cannot be done in code. Do them before running any wave:

- [ ] **Rotate OpenAI API key** — openai.com/account/api-keys → revoke old → create new → update Render env var `OPENAI_API_KEY`
- [ ] **Rotate Anthropic API key** — console.anthropic.com → revoke old → create new → update Render env var `ANTHROPIC_API_KEY`
- [ ] **Rotate Supabase service role key** — Supabase dashboard → Project Settings → API → rotate → update Render env var `SUPABASE_SERVICE_ROLE_KEY`
- [ ] **Set OpenAI monthly spending limit** — openai.com/account/limits → set hard limit (e.g. $50/month)
- [ ] **Change ADMIN_PORTAL_PASSWORD** in Render env vars from `admin123` to a strong random string

---

## Wave 1 — Auth Attack Surface (Critical)

**Impact:** Prevents brute-force on login + removes hardcoded credentials from source code.

### Files
- Modify: `lib/user-auth.js` — remove LOCAL_USERS export, read seed users from env
- Modify: `lib/config.js` — add `auth.loginRateLimitMax`, `auth.loginRateLimitWindowMs`
- Modify: `lib/rate-limit.js` — add IP-keyed `checkLoginLimit()` export
- Modify: `routes/auth.js` — call login rate limiter
- Modify: `.env.example` — document `LOCAL_USERS_JSON`

---

### Task 1: Add login rate limiter

**Files:**
- Modify: `lib/rate-limit.js`
- Modify: `lib/config.js`

- [ ] **Step 1: Add `auth` bucket to config**

In `lib/config.js`, inside the `rateLimit` object (after the `pipeline` entry):

```js
    auth: {
      max: toPositiveInt(process.env.RATE_LIMIT_AUTH_MAX, 5),
      windowMs: toPositiveInt(process.env.RATE_LIMIT_AUTH_WINDOW_MIN, 1) * 60_000
    }
```

Full updated `rateLimit` block:

```js
  rateLimit: {
    api: {
      max: toPositiveInt(process.env.RATE_LIMIT_API_MAX, 30),
      windowMs: toPositiveInt(process.env.RATE_LIMIT_API_WINDOW_MIN, 1) * 60_000
    },
    pipeline: {
      max: toPositiveInt(process.env.RATE_LIMIT_PIPELINE_MAX, 10),
      windowMs: toPositiveInt(process.env.RATE_LIMIT_PIPELINE_WINDOW_MIN, 60) * 60_000
    },
    auth: {
      max: toPositiveInt(process.env.RATE_LIMIT_AUTH_MAX, 5),
      windowMs: toPositiveInt(process.env.RATE_LIMIT_AUTH_WINDOW_MIN, 1) * 60_000
    }
  }
```

- [ ] **Step 2: Add `checkLoginLimit` to `lib/rate-limit.js`**

Append after the `resetRateLimits` export:

```js
/**
 * IP-keyed brute-force guard for login endpoint.
 * Returns { allowed: true } or { allowed: false, retryAfterSec: number }.
 */
export function checkLoginLimit(ip) {
  const limits = config.rateLimit?.auth;
  if (!limits) return { allowed: true };
  cleanupExpired();
  const key = `login:${ip}`;
  const win = getWindow(key, limits.windowMs);
  win.count++;
  if (win.count > limits.max) {
    const retryAfterSec = Math.ceil((win.windowStart + limits.windowMs - Date.now()) / 1000);
    return { allowed: false, retryAfterSec };
  }
  return { allowed: true };
}
```

- [ ] **Step 3: Apply limiter in `routes/auth.js`**

Add import at top of `routes/auth.js`:

```js
import { checkLoginLimit } from '../lib/rate-limit.js';
```

Inside the `POST /api/auth/login` handler, add this block **before** `const payload = await parseBody(request)`:

```js
    const ip = request.headers['x-forwarded-for']?.split(',')[0]?.trim()
               || request.socket?.remoteAddress
               || 'unknown';
    const rl = checkLoginLimit(ip);
    if (!rl.allowed) {
      return json(response, 429, {
        ok: false,
        error: `Too many login attempts — please wait ${rl.retryAfterSec} seconds`,
        retry_after_seconds: rl.retryAfterSec
      }), true;
    }
```

- [ ] **Step 4: Manual smoke test**

```bash
# Try 6 rapid login attempts with wrong password — 6th must return 429
for i in $(seq 1 6); do
  curl -s -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"wrong"}' | jq .
done
```

Expected: first 5 return `{"ok":false,"error":"Invalid credentials"}`, 6th returns `{"ok":false,"error":"Too many login attempts..."}` with HTTP 429.

- [ ] **Step 5: Commit**

```bash
git add lib/config.js lib/rate-limit.js routes/auth.js
git commit -m "security: add IP-based brute-force protection on /api/auth/login"
```

---

### Task 2: Remove hardcoded LOCAL_USERS from source code

**Problem:** `lib/user-auth.js` exports `LOCAL_USERS` with 5 accounts and shared password hashes baked into the repo. If the repo is ever public, credentials leak.

**Solution:** Move seed users to an env var `LOCAL_USERS_JSON` (base64-encoded JSON array). Fall back to a single `admin` account whose password comes from `ADMIN_PORTAL_PASSWORD`.

**Files:**
- Modify: `lib/user-auth.js`
- Modify: `.env.example`

- [ ] **Step 1: Replace LOCAL_USERS definition in `lib/user-auth.js`**

Remove the current hardcoded `export const LOCAL_USERS = [...]` block and replace it with:

```js
function buildLocalUsers() {
  // Option A: full user list via LOCAL_USERS_JSON env var (base64-encoded JSON array)
  const raw = process.env.LOCAL_USERS_JSON;
  if (raw) {
    try {
      return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    } catch {
      console.warn("[user-auth] LOCAL_USERS_JSON is invalid — falling back to admin-only");
    }
  }
  // Option B: single admin account from ADMIN_PORTAL_PASSWORD
  const pw = process.env.ADMIN_PORTAL_PASSWORD;
  if (!pw) {
    console.warn("[user-auth] No LOCAL_USERS_JSON and no ADMIN_PORTAL_PASSWORD set — local auth disabled");
    return [];
  }
  // Pre-hash is expensive at startup; store a bcrypt hash if provided, else use plaintext comparison
  return [
    {
      username: "admin",
      password_hash: null,  // will be compared via ADMIN_PORTAL_PASSWORD plaintext below
      _plain_password: pw,
      display_name: "Administrator",
      role: "admin"
    }
  ];
}

const LOCAL_USERS = buildLocalUsers();
```

- [ ] **Step 2: Update `validateUserCredentials` to handle `_plain_password`**

In `validateUserCredentials`, inside the local fallback block, replace:

```js
    const valid = await bcrypt.compare(password, local.password_hash);
    if (!valid) return null;
```

with:

```js
    let valid = false;
    if (local.password_hash) {
      valid = await bcrypt.compare(password, local.password_hash);
    } else if (local._plain_password) {
      valid = password === local._plain_password;
    }
    if (!valid) return null;
```

Apply the same change to the second `bcrypt.compare` call (the DB-fallback path).

- [ ] **Step 3: Update `.env.example`**

Add these lines to `.env.example`:

```
# Seed users for local/fallback auth.
# Option A: base64(JSON.stringify([{username,password_hash,display_name,role},...]))
# LOCAL_USERS_JSON=

# Option B: single admin account (used when LOCAL_USERS_JSON is absent)
ADMIN_PORTAL_PASSWORD=change_me_before_deploy
```

- [ ] **Step 4: Verify existing smoke test still passes**

```bash
npm run smoke -- --mock
```

Expected: `{"ok":true,...}` — smoke test uses mock mode so no auth needed.

- [ ] **Step 5: Commit**

```bash
git add lib/user-auth.js .env.example
git commit -m "security: remove hardcoded LOCAL_USERS — read from LOCAL_USERS_JSON env var"
```

---

## Wave 2 — Durable Rate Limiting (High)

**Impact:** Current in-memory rate limiter resets every time Render restarts the server (which happens on free tier after inactivity). Supabase-backed counters survive restarts.

**Files:**
- Create: `lib/rate-limit-db.js` — Supabase-backed counter, same interface as `checkLoginLimit`
- Modify: `lib/rate-limit.js` — export `checkLoginLimitDurable` that delegates to DB when Supabase is available
- Requires: a new Supabase table `rate_limit_counters`

---

### Task 3: Create rate_limit_counters table in Supabase

- [ ] **Step 1: Run migration SQL in Supabase SQL editor**

Go to Supabase dashboard → SQL editor → run:

```sql
create table if not exists rate_limit_counters (
  key text primary key,
  count integer not null default 0,
  window_start bigint not null,
  window_ms bigint not null,
  updated_at timestamptz default now()
);

-- Auto-cleanup old entries (optional but keeps table small)
create index if not exists idx_rl_window_start on rate_limit_counters (window_start);
```

- [ ] **Step 2: Verify table exists**

```bash
# Using Supabase MCP or dashboard: select * from rate_limit_counters limit 1;
```

Expected: empty result, no error.

---

### Task 4: Implement Supabase-backed rate limiter

**Files:**
- Create: `lib/rate-limit-db.js`
- Modify: `lib/rate-limit.js`

- [ ] **Step 1: Create `lib/rate-limit-db.js`**

```js
import { getSupabaseAdmin } from "./supabase.js";

/**
 * Supabase-backed rate limiter. Survives server restarts.
 * Returns { allowed: true } or { allowed: false, retryAfterSec }.
 */
export async function checkLimitDb(key, max, windowMs) {
  const client = getSupabaseAdmin();
  if (!client) return null; // signal caller to fall back to in-memory

  const now = Date.now();

  // Upsert: if key is new or window has expired, reset; otherwise increment
  const { data, error } = await client.rpc("rate_limit_increment", {
    p_key: key,
    p_max: max,
    p_window_ms: windowMs,
    p_now: now
  });

  if (error) {
    console.warn("[rate-limit-db] rpc error — falling back to allow:", error.message);
    return null; // fail open: don't block user on DB error
  }

  const { count, window_start } = data;
  if (count > max) {
    const retryAfterSec = Math.ceil((window_start + windowMs - now) / 1000);
    return { allowed: false, retryAfterSec };
  }
  return { allowed: true };
}
```

- [ ] **Step 2: Create Postgres function `rate_limit_increment`**

Run in Supabase SQL editor:

```sql
create or replace function rate_limit_increment(
  p_key text,
  p_max integer,
  p_window_ms bigint,
  p_now bigint
) returns json language plpgsql as $$
declare
  v_row rate_limit_counters%rowtype;
begin
  select * into v_row from rate_limit_counters where key = p_key for update;

  if not found or (p_now - v_row.window_start) > p_window_ms then
    -- New window
    insert into rate_limit_counters (key, count, window_start, window_ms, updated_at)
    values (p_key, 1, p_now, p_window_ms, now())
    on conflict (key) do update
      set count = 1, window_start = p_now, window_ms = p_window_ms, updated_at = now();
    return json_build_object('count', 1, 'window_start', p_now);
  else
    -- Same window — increment
    update rate_limit_counters
    set count = count + 1, updated_at = now()
    where key = p_key;
    return json_build_object('count', v_row.count + 1, 'window_start', v_row.window_start);
  end if;
end;
$$;
```

- [ ] **Step 3: Update `checkLoginLimit` in `lib/rate-limit.js` to try DB first**

Add import at top of `lib/rate-limit.js`:

```js
import { checkLimitDb } from "./rate-limit-db.js";
import { config } from "./config.js";
```

Replace the existing `checkLoginLimit` with:

```js
export async function checkLoginLimit(ip) {
  const limits = config.rateLimit?.auth;
  if (!limits) return { allowed: true };

  const key = `login:${ip}`;

  // Try durable DB counter first
  const dbResult = await checkLimitDb(key, limits.max, limits.windowMs);
  if (dbResult !== null) return dbResult;

  // Fallback to in-memory
  cleanupExpired();
  const win = getWindow(key, limits.windowMs);
  win.count++;
  if (win.count > limits.max) {
    const retryAfterSec = Math.ceil((win.windowStart + limits.windowMs - Date.now()) / 1000);
    return { allowed: false, retryAfterSec };
  }
  return { allowed: true };
}
```

- [ ] **Step 4: Update `routes/auth.js` to await the now-async call**

The call in `routes/auth.js` was synchronous. Change:

```js
    const rl = checkLoginLimit(ip);
```

to:

```js
    const rl = await checkLoginLimit(ip);
```

- [ ] **Step 5: Manual test — rate limit survives restart**

```bash
# Make 3 failed login attempts
for i in 1 2 3; do
  curl -s -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"wrong"}' | jq .ok
done

# Restart server
# npm run start (or Render redeploy)

# 4th attempt from same IP should still count toward the limit
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"wrong"}' | jq .
```

Expected: counter persists — attempt 4 is counted (not reset to 0 after restart).

- [ ] **Step 6: Commit**

```bash
git add lib/rate-limit-db.js lib/rate-limit.js routes/auth.js
git commit -m "security: durable Supabase-backed login rate limiter (survives restarts)"
```

---

## Wave 3 — Cost Guard + Error Observability (Medium)

**Impact:** Prevents runaway OpenAI bills from looping chat sessions and provides visibility when prod errors occur.

---

### Task 5: Per-session token budget guard

**Problem:** A user can loop `/api/chat` indefinitely, accumulating thousands of dollars in OpenAI calls per session.

**Files:**
- Modify: `lib/config.js` — add `openai.sessionTokenBudget`
- Modify: `routes/chat.js` — check cumulative token usage per session before calling LLM
- Modify: `lib/db/agents.js` — add `getSessionTokenUsage(sessionId)` helper

- [ ] **Step 1: Add budget config to `lib/config.js`**

Inside the `openai` config object, add:

```js
    sessionTokenBudget: toPositiveInt(process.env.OPENAI_SESSION_TOKEN_BUDGET, 50000)
```

Full updated `openai` block:

```js
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    models: {
      discovery: process.env.OPENAI_MODEL_DISCOVERY || MODEL_STANDARD,
      specialist: process.env.OPENAI_MODEL_SPECIALIST || MODEL_STANDARD,
      solution: process.env.OPENAI_MODEL_SOLUTION || MODEL_PREMIUM,
      bom: process.env.OPENAI_MODEL_BOM || MODEL_PREMIUM,
      proposal: process.env.OPENAI_MODEL_PROPOSAL || MODEL_STANDARD
    },
    sessionTokenBudget: toPositiveInt(process.env.OPENAI_SESSION_TOKEN_BUDGET, 50000)
  },
```

- [ ] **Step 2: Add `getSessionTokenUsage` to `lib/db/agents.js`**

Append to `lib/db/agents.js`:

```js
/**
 * Sum all input+output tokens logged for a project/session in agent_logs.
 * Returns 0 if Supabase is unavailable.
 */
export async function getSessionTokenUsage(projectId) {
  const client = getSupabaseAdmin();
  if (!client) return 0;
  const { data, error } = await client
    .from("agent_logs")
    .select("input_tokens, output_tokens")
    .eq("project_id", projectId);
  if (error || !data) return 0;
  return data.reduce((sum, row) => sum + (row.input_tokens ?? 0) + (row.output_tokens ?? 0), 0);
}
```

- [ ] **Step 3: Add budget check in `routes/chat.js`**

Find the POST handler for `/api/chat` (or equivalent). Before the LLM call, add:

```js
import { getSessionTokenUsage } from '../lib/db/agents.js';
import { config } from '../lib/config.js';

// Inside handler, after extracting projectId:
const tokenUsage = await getSessionTokenUsage(projectId);
const budget = config.openai.sessionTokenBudget;
if (tokenUsage >= budget) {
  return json(response, 429, {
    ok: false,
    error: `Session token budget exceeded (${tokenUsage.toLocaleString()}/${budget.toLocaleString()} tokens). Start a new project to continue.`
  }), true;
}
```

- [ ] **Step 4: Add env var to `.env.example`**

```
# Max cumulative OpenAI tokens per project/session (default 50000 ≈ ~$0.03)
OPENAI_SESSION_TOKEN_BUDGET=50000
```

- [ ] **Step 5: Manual test**

Set `OPENAI_SESSION_TOKEN_BUDGET=10` in `.env`, send one chat message, verify response includes budget exceeded error on second message (since even 1 call uses >10 tokens).

Restore `OPENAI_SESSION_TOKEN_BUDGET=50000` after test.

- [ ] **Step 6: Commit**

```bash
git add lib/config.js lib/db/agents.js routes/chat.js .env.example
git commit -m "feat: per-session OpenAI token budget guard to prevent runaway costs"
```

---

### Task 6: Sentry error monitoring

**Files:**
- Modify: `package.json` — add `@sentry/node`
- Modify: `server.js` — init Sentry, wrap unhandled exceptions
- Modify: `lib/config.js` — add `sentry.dsn`
- Modify: `.env.example` — document `SENTRY_DSN`

- [ ] **Step 1: Install Sentry**

```bash
npm install @sentry/node
```

- [ ] **Step 2: Add `sentry.dsn` to `lib/config.js`**

Add to the config object:

```js
  sentry: {
    dsn: process.env.SENTRY_DSN || ""
  },
```

- [ ] **Step 3: Init Sentry at top of `server.js`**

Add before any other imports that might throw:

```js
import * as Sentry from "@sentry/node";
import { config } from "./lib/config.js";

if (config.sentry.dsn) {
  Sentry.init({
    dsn: config.sentry.dsn,
    environment: process.env.NODE_ENV || "production",
    tracesSampleRate: 0.1
  });
}
```

- [ ] **Step 4: Catch unhandled errors and report to Sentry**

In `server.js`, add near the bottom of the file before `server.listen`:

```js
process.on("uncaughtException", (err) => {
  if (config.sentry.dsn) Sentry.captureException(err);
  logger.error("uncaught_exception", { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  if (config.sentry.dsn) Sentry.captureException(reason);
  logger.error("unhandled_rejection", { reason: String(reason) });
});
```

- [ ] **Step 5: Update `.env.example`**

```
# Sentry DSN for error monitoring (leave empty to disable)
SENTRY_DSN=
```

- [ ] **Step 6: Get DSN from Sentry**

1. Go to sentry.io → Create new project → Node.js
2. Copy DSN → add to Render env vars as `SENTRY_DSN`

- [ ] **Step 7: Commit**

```bash
git add server.js lib/config.js .env.example package.json package-lock.json
git commit -m "feat: add Sentry error monitoring for production observability"
```

---

## Deployment Checklist

After all waves:

- [ ] All 5 manual credential rotations done (see top of plan)
- [ ] `git push origin master` → Render auto-deploys
- [ ] `npm run smoke` passes after deploy
- [ ] Login with correct credentials works
- [ ] 6 rapid wrong-password attempts trigger 429
- [ ] Sentry receives a test event (throw intentional error, check Sentry dashboard)
