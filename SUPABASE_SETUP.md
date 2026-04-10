# Supabase Setup

This project already has service credentials in [`.env`](C:\Users\Pitsanu\AI-presale-system\.env), but the required database objects are not yet present in the target Supabase project.

## Current status

Expected tables:

- `projects`
- `knowledge_base`
- `pricing_catalog`
- `agent_logs`

Current remote check:

- schema is now applied
- expected tables are reachable through the REST interface
- KB embedding is still blocked by OpenAI quota on the current API key

## Apply schema

1. Open the Supabase dashboard for the target project.
2. Open the SQL Editor.
3. Paste the contents of [`supabase/schema.sql`](C:\Users\Pitsanu\AI-presale-system\supabase\schema.sql).
4. Run the SQL.

## Verify after apply

Run:

```powershell
node scripts/check-supabase-schema.js
```

Expected outcome:

- `ok: true`
- `missing_tables: []`

## Next step after schema apply

1. Re-run `node scripts/check-supabase-schema.js`
2. Restore OpenAI quota/billing access
3. Re-run `node knowledge_base/embed.js`
4. Start Phase 2 KB population
5. Resume integrated agent tests
