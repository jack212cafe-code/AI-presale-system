# Free Trial Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** แก้ bug quota/cost tracking และ enforce tier limit ก่อนเปิด Free Trial ให้ real users

**Architecture:** 3 waves อิสระต่อกัน — DB Migration ก่อน → แก้ Logic → เพิ่ม Admin UI  
tier อยู่บน `organizations` table (ไม่ใช่ `users`) → quota join ผ่าน `projects.org_id → organizations.tier`  
`agent_logs` ยังไม่มี `user_id` — Wave 1 เพิ่ม column นี้

**Tech Stack:** Node.js ESM, Supabase Postgres, `lib/supabase.js`, `lib/quota-manager.js`, `server.js`

---

## ⚠️ สถานะก่อนเริ่ม (อ่านทุกครั้ง)

| ปัญหา | ไฟล์ | บรรทัด |
|-------|------|--------|
| `agent_logs` ไม่มี `user_id` | `supabase/schema.sql` | — |
| `checkTokenQuota` join ผิด (`project_id = userId`) | `lib/quota-manager.js` | 76 |
| Quota ไม่ถูก enforce ใน chat endpoint | `server.js` | ~620 |
| managed-agent log tokens_used = null | `managed-agents/session.mjs` | ~149 |
| migration 12 (multi-tenancy) อาจยังไม่ได้ apply บน prod | `supabase/migrations/12_saas_multi_tenancy.sql` | — |

---

## Wave 1 — DB Schema Fix
**เป้าหมาย:** เพิ่ม `user_id` ใน `agent_logs` + verify migration 12 ถูก apply

### Task 1.1: ตรวจสอบสถานะ Migration 12 บน Supabase

**Files:**
- Read: `supabase/migrations/12_saas_multi_tenancy.sql`

- [ ] **Step 1: ตรวจสอบว่า `organizations` table มีอยู่จริงไหม**

ไปที่ Supabase Dashboard → Table Editor → ดูว่ามี `organizations` table และ `users.org_id` column หรือไม่

Expected: ถ้ามี → ข้ามไป Task 1.2  
ถ้าไม่มี → ต้อง apply migration 12 ก่อน

- [ ] **Step 2: Apply migration 12 ถ้ายังไม่ได้ apply**

Supabase Dashboard → SQL Editor → วางเนื้อหาจาก `supabase/migrations/12_saas_multi_tenancy.sql` แล้ว Run

- [ ] **Step 3: ตรวจสอบ `organizations` table มี Default Organization**

```sql
SELECT id, name, tier FROM organizations;
```

Expected: มี 1 row `Default Organization` tier = `growth`

---

### Task 1.2: สร้าง Migration เพิ่ม `user_id` ใน `agent_logs`

**Files:**
- Create: `supabase/migrations/13_agent_logs_user_id.sql`

- [ ] **Step 1: สร้างไฟล์ migration**

```sql
-- Migration 13: Add user_id to agent_logs for per-user quota tracking
ALTER TABLE agent_logs
  ADD COLUMN IF NOT EXISTS user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_agent_logs_user_id ON agent_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_logs_user_created ON agent_logs(user_id, created_at);
```

- [ ] **Step 2: Apply บน Supabase**

Supabase Dashboard → SQL Editor → วาง SQL ด้านบน → Run

Expected: `ALTER TABLE` / `CREATE INDEX` สำเร็จ ไม่มี error

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/13_agent_logs_user_id.sql
git commit -m "db: add user_id column to agent_logs for per-user quota tracking"
```

---

### Task 1.3: เพิ่ม Free Trial Tier ใน Default Organization

**Files:**
- Create: `supabase/migrations/14_free_trial_tier.sql`

- [ ] **Step 1: สร้างไฟล์ migration**

```sql
-- Migration 14: Add free_trial tier option
ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_tier_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_tier_check
  CHECK (tier IN ('free_trial', 'entry', 'growth', 'enterprise'));
```

- [ ] **Step 2: Apply บน Supabase**

Supabase Dashboard → SQL Editor → Run

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/14_free_trial_tier.sql
git commit -m "db: add free_trial tier to organizations"
```

---

## Wave 2 — Quota Logic Fix
**เป้าหมาย:** แก้ quota-manager bug + wire enforcement เข้า chat endpoint + log user_id ใน managed agent

### Task 2.1: แก้ `lib/quota-manager.js`

**Files:**
- Modify: `lib/quota-manager.js`

- [ ] **Step 1: แก้ SAAS_TIERS เพิ่ม `free_trial`**

```js
export const SAAS_TIERS = {
  free_trial: {
    max_projects_per_month: 3,
    daily_token_limit: 50_000,
    rate_limit_multiplier: 0.5,
  },
  entry: {
    max_projects_per_month: 5,
    daily_token_limit: 100_000,
    rate_limit_multiplier: 1.0,
  },
  growth: {
    max_projects_per_month: 20,
    daily_token_limit: 1_000_000,
    rate_limit_multiplier: 2.0,
  },
  enterprise: {
    max_projects_per_month: null,
    daily_token_limit: 10_000_000,
    rate_limit_multiplier: 5.0,
  }
};
```

- [ ] **Step 2: แก้ `checkProjectQuota` — query by `user_id` ใน projects**

```js
async checkProjectQuota(userId, tier = 'growth') {
  const quota = SAAS_TIERS[tier] || SAAS_TIERS.growth;
  const limit = quota.max_projects_per_month;

  if (limit === null) return { allowed: true, current: 0, limit: null };

  const client = getSupabaseAdmin();
  if (!client) return { allowed: true, current: 0, limit: null };

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count, error } = await client
    .from("projects")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startOfMonth.toISOString());

  if (error) throw new Error(`Quota check failed: ${error.message}`);

  return {
    allowed: (count || 0) < limit,
    current: count || 0,
    limit
  };
}
```

- [ ] **Step 3: แก้ `checkTokenQuota` — query by `user_id` ใน agent_logs**

```js
async checkTokenQuota(userId, tier = 'growth') {
  const quota = SAAS_TIERS[tier] || SAAS_TIERS.growth;
  const limit = quota.daily_token_limit;

  const client = getSupabaseAdmin();
  if (!client) return { allowed: true, current: 0, limit };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data, error } = await client
    .from("agent_logs")
    .select("tokens_used")
    .eq("user_id", userId)
    .gte("created_at", today.toISOString());

  if (error) throw new Error(`Token quota check failed: ${error.message}`);

  const totalUsed = (data || []).reduce((sum, row) => sum + (row.tokens_used || 0), 0);

  return {
    allowed: totalUsed < limit,
    current: totalUsed,
    limit
  };
}
```

- [ ] **Step 4: เพิ่ม `getTierForUser` helper**

```js
export async function getTierForUser(userId) {
  const client = getSupabaseAdmin();
  if (!client) return 'growth';

  const { data, error } = await client
    .from("users")
    .select("org_id, organizations(tier)")
    .eq("id", userId)
    .single();

  if (error || !data) return 'growth';
  return data.organizations?.tier || 'growth';
}
```

- [ ] **Step 5: Commit**

```bash
git add lib/quota-manager.js
git commit -m "fix(quota): correct user_id join and add getTierForUser helper"
```

---

### Task 2.2: Log `user_id` ใน managed-agent turn

**Files:**
- Modify: `managed-agents/session.mjs`
- Modify: `managed-agents/chat-managed.mjs`

- [ ] **Step 1: ส่ง `userId` เข้า `chat()` function ใน session.mjs**

แก้ signature ใน `session.mjs`:
```js
export async function chat(projectId, userText, onStream, userId) {
  ensureInitialized();
  const sessionId = await getOrCreateSession(projectId);
  return runTurn(sessionId, projectId, userText, onStream, userId);
}
```

แก้ `runTurn` signature:
```js
async function runTurn(sessionId, projectId, userText, onStream, userId) {
```

แก้ `writeAgentLog` call ท้าย `runTurn`:
```js
writeAgentLog({
  project_id: projectId ?? null,
  user_id: userId ?? null,
  agent_name: "managed-agent",
  model_used: "claude-sonnet-4-6",
  tokens_used: null,
  cost_usd: null,
  duration_ms: Date.now() - startMs,
  status: "success",
}).catch((e) => console.warn("[audit] log write failed:", e.message));
```

- [ ] **Step 2: ส่ง `userId` จาก `chat-managed.mjs`**

```js
await chat(projectId, message, (chunk) => {
  if (!chunk.startsWith('{"type":')) fullText += chunk;
  onProgress?.(2, 2, `Agent is typing... ${fullText.slice(-20)}...`);
}, userId);
```

- [ ] **Step 3: Commit**

```bash
git add managed-agents/session.mjs managed-agents/chat-managed.mjs
git commit -m "feat: pass user_id to managed-agent log for per-user quota tracking"
git push
```

---

### Task 2.3: Wire Quota Check เข้า Chat Endpoint

**Files:**
- Modify: `server.js` (chat endpoint ~บรรทัด 620)

- [ ] **Step 1: Import quota tools ใน server.js**

เพิ่มที่ส่วน import:
```js
import { quotaManager, getTierForUser } from "./lib/quota-manager.js";
```

- [ ] **Step 2: เพิ่ม quota check ก่อน handleChatMessage**

หา block ที่มี `handleChatMessage` ใน server.js แล้วเพิ่มก่อน call:

```js
// Quota check
const userId = getSessionUserId(request);
if (userId) {
  try {
    const tier = await getTierForUser(userId);
    const projectCheck = await quotaManager.checkProjectQuota(userId, tier);
    if (!projectCheck.allowed) {
      return json(response, 429, {
        ok: false,
        error: `Project limit reached (${projectCheck.current}/${projectCheck.limit} this month). Upgrade your plan.`
      });
    }
  } catch (e) {
    console.warn("[quota] check failed, allowing through:", e.message);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: enforce monthly project quota per user tier in chat endpoint"
git push
```

---

## Wave 3 — Admin UI: Tier Management
**เป้าหมาย:** Admin สามารถดู/เปลี่ยน tier ของ user และดู usage

### Task 3.1: Admin API — Get/Set Org Tier

**Files:**
- Modify: `server.js` (admin section)

- [ ] **Step 1: เพิ่ม GET `/api/admin/users/:id/tier`**

```js
if (request.method === "GET" && url.pathname.match(/^\/api\/admin\/users\/[^/]+\/tier$/)) {
  if (!requireRole(request, response, ["admin"])) return;
  const userId = url.pathname.split("/")[4];
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from("users")
    .select("id, username, org_id, organizations(tier)")
    .eq("id", userId)
    .single();
  if (error) return json(response, 404, { ok: false, error: error.message });
  return json(response, 200, { ok: true, tier: data.organizations?.tier || 'growth' });
}
```

- [ ] **Step 2: เพิ่ม PUT `/api/admin/orgs/:orgId/tier`**

```js
if (request.method === "PUT" && url.pathname.match(/^\/api\/admin\/orgs\/[^/]+\/tier$/)) {
  if (!requireRole(request, response, ["admin"])) return;
  const orgId = url.pathname.split("/")[4];
  const { tier } = await parseBody(request);
  const validTiers = ['free_trial', 'entry', 'growth', 'enterprise'];
  if (!validTiers.includes(tier)) {
    return json(response, 400, { ok: false, error: `Invalid tier. Must be one of: ${validTiers.join(', ')}` });
  }
  const client = getSupabaseAdmin();
  const { error } = await client
    .from("organizations")
    .update({ tier, updated_at: new Date().toISOString() })
    .eq("id", orgId);
  if (error) return json(response, 500, { ok: false, error: error.message });
  return json(response, 200, { ok: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat(admin): add API to get and set org tier"
```

---

### Task 3.2: Admin UI — แสดง Tier ในหน้า Users

**Files:**
- Modify: `admin/admin.js`

- [ ] **Step 1: แก้ `renderUsers` เพิ่มคอลัมน์ Tier**

หา `renderUsers` function แล้วแก้ column header:
```js
<th>Username</th><th>Display Name</th><th>Role</th><th>Tier</th><th>Joined</th><th></th>
```

แก้ row rendering:
```js
<td>${escapeHtml(u.username)}</td>
<td>${escapeHtml(u.display_name || '')}</td>
<td>${escapeHtml(u.role || '')}</td>
<td>
  <select class="tier-select" data-org-id="${escapeHtml(u.org_id || '')}" data-user-id="${escapeHtml(u.id)}">
    <option value="free_trial" ${u.tier === 'free_trial' ? 'selected' : ''}>Free Trial</option>
    <option value="entry" ${u.tier === 'entry' ? 'selected' : ''}>Entry</option>
    <option value="growth" ${(u.tier === 'growth' || !u.tier) ? 'selected' : ''}>Growth</option>
    <option value="enterprise" ${u.tier === 'enterprise' ? 'selected' : ''}>Enterprise</option>
  </select>
</td>
```

- [ ] **Step 2: เพิ่ม event listener สำหรับ tier change**

```js
document.addEventListener("change", async (e) => {
  if (!e.target.classList.contains("tier-select")) return;
  const orgId = e.target.dataset.orgId;
  const tier = e.target.value;
  if (!orgId) { alert("User has no org_id — apply migration 12 first"); return; }
  const { response } = await apiFetch(`/api/admin/orgs/${orgId}/tier`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier }),
  });
  if (!response.ok) alert("Failed to update tier");
});
```

- [ ] **Step 3: แก้ `/api/admin/users` query ให้ดึง tier ด้วย**

ใน server.js หา `/api/admin/users` GET endpoint แล้วแก้ select:
```js
.select("id, username, display_name, role, created_at, org_id, organizations(tier)")
```

แล้วใน renderUsers แก้ให้ใช้ `u.organizations?.tier`

- [ ] **Step 4: Commit และ Push**

```bash
git add server.js admin/admin.js
git commit -m "feat(admin-ui): show and edit tier per user in admin portal"
git push
```

---

## สรุป Waves

| Wave | งาน | ความเสี่ยง | ต้องทำก่อน Free Trial? |
|------|-----|----------|----------------------|
| **Wave 1** | DB Migration (user_id, free_trial tier) | ต่ำ — additive only | ✅ ใช่ |
| **Wave 2** | Fix quota logic + enforce + log user_id | กลาง — แก้ production code | ✅ ใช่ |
| **Wave 3** | Admin UI tier management | ต่ำ — UI only | แนะนำ แต่ไม่ blocking |

**ลำดับขั้นต่ำก่อน Free Trial:** Wave 1 → Wave 2 Task 2.1 → Wave 2 Task 2.3

---

## Notes สำหรับ Session ถัดไป

- Migration 12 status ต้อง verify จาก Supabase dashboard ก่อนทำ Wave 1
- `projects.user_id` column ต้อง verify ด้วย (migration-02-projects-user-id.sql ควรจะเพิ่มไว้แล้ว)
- Anthropic managed agent tokens = null ตลอด — ยังไม่มี API endpoint สำหรับดึง usage
- Cost ของ managed agent จะไม่ถูก track จนกว่า Anthropic จะเปิด billing API
