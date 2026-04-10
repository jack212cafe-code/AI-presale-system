import "dotenv/config";

const expectedTables = ["projects", "knowledge_base", "pricing_catalog", "agent_logs"];

async function checkTable(table) {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
    }
  });

  const text = await response.text();

  return {
    table,
    exists: response.ok,
    status: response.status,
    body: text
  };
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log(
    JSON.stringify(
      {
        ok: false,
        error: "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"
      },
      null,
      2
    )
  );
  process.exit(1);
}

const results = [];
for (const table of expectedTables) {
  results.push(await checkTable(table));
}

const missing = results.filter((item) => !item.exists).map((item) => item.table);

console.log(
  JSON.stringify(
    {
      ok: missing.length === 0,
      checked_at: new Date().toISOString(),
      expected_tables: expectedTables,
      missing_tables: missing,
      results: results.map((item) => ({
        table: item.table,
        exists: item.exists,
        status: item.status,
        message: item.body.slice(0, 180)
      }))
    },
    null,
    2
  )
);

if (missing.length > 0) {
  process.exitCode = 1;
}

