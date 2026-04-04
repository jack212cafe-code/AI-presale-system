import "dotenv/config";
import { hasOpenAi } from "../lib/config.js";

const BASE_URL = process.env.PUBLIC_BASE_URL || "http://localhost:3000";
const PIPELINE_THRESHOLD = 60000;
const TURN_THRESHOLD = 10000;

if (!hasOpenAi()) {
  console.error("ERROR: OPENAI_API_KEY not set. perf-check requires live credentials.");
  process.exit(1);
}

async function checkServerReachable() {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/session`, { method: "GET" });
    if (!res.ok && res.status !== 401) {
      throw new Error(`Server returned ${res.status}`);
    }
  } catch (err) {
    if (err.cause?.code === "ECONNREFUSED" || err.message.includes("fetch failed")) {
      console.error(`ERROR: Server not reachable at ${BASE_URL}. Start with: node server.js`);
      process.exit(1);
    }
    throw err;
  }
}

async function login() {
  const username = process.env.PERF_CHECK_USERNAME || "admin";
  const password = process.env.PERF_CHECK_PASSWORD || process.env.ADMIN_PORTAL_PASSWORD || "";

  if (!password) {
    console.error("ERROR: PERF_CHECK_PASSWORD or ADMIN_PORTAL_PASSWORD must be set for login.");
    process.exit(1);
  }

  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error(`ERROR: Login failed (${res.status}): ${body.error || "unknown"}`);
    process.exit(1);
  }

  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) {
    console.error("ERROR: No session cookie returned from login.");
    process.exit(1);
  }

  const cookie = setCookie.split(";")[0];
  return cookie;
}

async function timeTurn(cookie, body) {
  const start = Date.now();
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie
    },
    body: JSON.stringify(body)
  });
  const elapsed = Date.now() - start;

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`Chat request failed (${res.status}): ${data.error || "unknown"}`);
  }

  const data = await res.json();
  return { elapsed, data };
}

function formatResult(label, elapsed, threshold) {
  const status = elapsed <= threshold ? "PASS" : "FAIL";
  return `${label.padEnd(20)} ${String(elapsed).padStart(6)}ms / ${threshold}ms threshold — ${status}`;
}

await checkServerReachable();

console.log(`Connecting to ${BASE_URL} ...`);
const cookie = await login();
console.log("Login OK. Running performance checks...\n");

const brief = "ต้องการระบบ HCI สำหรับ 100 users, 50 VMs, 20TB storage พร้อม backup";

let turn1Elapsed, conversationId;
try {
  const result = await timeTurn(cookie, { message: brief });
  turn1Elapsed = result.elapsed;
  conversationId = result.data.conversation_id;
} catch (err) {
  console.error(`ERROR (Turn 1): ${err.message}`);
  process.exit(1);
}

let turn2Elapsed;
try {
  const result = await timeTurn(cookie, { message: "1", conversation_id: conversationId });
  turn2Elapsed = result.elapsed;
} catch (err) {
  console.error(`ERROR (Turn 2): ${err.message}`);
  process.exit(1);
}

console.log("=== Performance Check Results ===");
console.log(formatResult("Pipeline (turn 1):", turn1Elapsed, PIPELINE_THRESHOLD));
console.log(formatResult("Selection (turn 2):", turn2Elapsed, TURN_THRESHOLD));

const allPass = turn1Elapsed <= PIPELINE_THRESHOLD && turn2Elapsed <= TURN_THRESHOLD;
if (!allPass) {
  process.exit(1);
}
