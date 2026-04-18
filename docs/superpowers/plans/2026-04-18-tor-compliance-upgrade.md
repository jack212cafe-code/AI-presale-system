# TOR Compliance Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let presale engineers upload TOR files (PDF / DOCX / TXT / MD ≤15MB), produce a TOR compliance report with per-check citations (`evidence_quote` + `source_file`) that are verified against the KB to prevent LLM hallucination, and export the report as Excel and PDF in addition to the existing CSV.

**Architecture:** Add a stateless `POST /api/tor/extract` endpoint that pulls text from an uploaded file via a new `extractTextFromBuffer` helper (reusing `pdf-parse` / `mammoth` already in the stack). Extend the TOR compliance agent schema with two citation fields and add a substring-level quote verifier that downgrades unverified quotes to `review` status. Add `exceljs`-based XLSX and puppeteer HTML-to-PDF exporters that consume the same in-memory `torReports` cache as the existing CSV export. Update the chat UI to attach a file via a 📎 button (auto-fills the existing textarea) and to render Excel / PDF export links alongside the existing CSV link.

**Tech Stack:**
- Backend: Node.js (existing `node:http` routing), `pdf-parse`, `mammoth`, `exceljs`, `puppeteer`, `handlebars` — **all already in `package.json`** (`pdfkit` deliberately skipped in favor of the existing puppeteer-based PDF pipeline in `lib/pdf-export.js`)
- Frontend: Plain JS in `chat/chat.html` + `chat/chat.js` (no framework)
- Testing: `node --test` (existing test runner), new file `test/unit/tor.test.js`

**Feedback rule in effect (from memory `feedback_commit_deploy_test`):** After every task below, commit, push (triggers Render auto-deploy), verify the deploy reaches `live`, and run the Production Verification step. Do not start the next task until the previous task is verified live.

---

## File Structure

### Files created

- `test/unit/tor.test.js` — new unit tests for `extractTextFromBuffer`, quote verifier, exporters
- `test/fixtures/tor-sample.pdf` — tiny text-based PDF fixture for extraction tests (generated once via puppeteer; committed)
- `test/fixtures/tor-sample.docx` — tiny DOCX fixture
- `test/fixtures/tor-sample.scan.pdf` — image-only PDF fixture for scan detection test

### Files modified

- `knowledge_base/raw-import-lib.js` — add `extractTextFromBuffer(buffer, extension)` sibling to the existing `extractTextFromFile`
- `routes/tor.js` — add `POST /api/tor/extract`, `GET /api/tor/:id/export.xlsx`, `GET /api/tor/:id/export.pdf`
- `agents/tor.js` — extend `torComplianceSchema` with `evidence_quote` + `evidence_source_file`, add `verifyEvidenceQuotes` helper, call it inside `runTorComplianceItemAgent` after the LLM returns
- `agents/_prompts/tor_compliance.md` — instruct the LLM to return verbatim quotes and the exact `source_file` from the supplied KB block
- `lib/tor-export.js` — add `generateTorComplianceXlsx(report)`; keep existing CSV generator intact
- `lib/pdf-export.js` — add `generateTorCompliancePdf(report)` method on `PdfExportEngine` (or similar module-level function) reusing the existing puppeteer + handlebars pattern
- `chat/chat.html` — add `📎 แนบไฟล์ TOR` button + hidden `<input type=file>` inside `.tor-panel`
- `chat/chat.js` — add file-extract handler (fills `#tor-textarea`) and render Excel + PDF download links next to the existing CSV link in `renderTorTable` output

### Responsibility boundaries

- `raw-import-lib.js` stays the single owner of "raw bytes → text" logic; the new buffer helper reuses the same parser dependencies as the admin-kb file path
- `agents/tor.js` owns the schema + verification loop; `tor-export.js` and `pdf-export.js` are pure render functions that take a finished report and return a buffer
- `routes/tor.js` is the only surface that touches HTTP / cookies / the 24-hour `torReports` cache; it delegates all logic to the libs above

---

## Task 1: `extractTextFromBuffer` helper

**Files:**
- Modify: `knowledge_base/raw-import-lib.js` (add new export near line 97 next to `extractTextFromFile`)
- Test: `test/unit/tor.test.js` (create)
- Fixtures: `test/fixtures/tor-sample.pdf`, `test/fixtures/tor-sample.docx`, `test/fixtures/tor-sample.scan.pdf`

- [ ] **Step 1: Create the three fixtures**

Generate the fixtures with a one-off Node script (run once, commit the files, do not commit the script):

```js
// scratch only — do not commit
import puppeteer from "puppeteer";
import { writeFile } from "node:fs/promises";
import { Document, Packer, Paragraph } from "docx";

// tor-sample.pdf: real text, Thai + English
const browser = await puppeteer.launch({ headless: "shell", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setContent(`<html><body><h1>TOR ตัวอย่าง</h1><p>1. เครื่องแม่ข่าย จำนวน 2 เครื่อง</p><p>- ซีพียูไม่น้อยกว่า 2.5 GHz</p><p>- RAM ไม่น้อยกว่า 64 GB</p></body></html>`);
await writeFile("test/fixtures/tor-sample.pdf", await page.pdf({ format: "A4" }));

// tor-sample.scan.pdf: an image-only PDF (no text layer)
await page.setContent(`<html><body style="margin:0"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="></body></html>`);
await writeFile("test/fixtures/tor-sample.scan.pdf", await page.pdf({ format: "A4" }));
await browser.close();

// tor-sample.docx
const doc = new Document({ sections: [{ children: [ new Paragraph("TOR sample DOCX"), new Paragraph("CPU >= 2.5 GHz") ] }] });
await writeFile("test/fixtures/tor-sample.docx", await Packer.toBuffer(doc));
```

Commit only the three output files (`.pdf`, `.pdf`, `.docx`), not the script.

- [ ] **Step 2: Write failing unit tests**

Create `test/unit/tor.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const { extractTextFromBuffer } = await import("../../knowledge_base/raw-import-lib.js");

test("extractTextFromBuffer returns text for a text-based PDF", async () => {
  const buf = await readFile(path.resolve("test/fixtures/tor-sample.pdf"));
  const text = await extractTextFromBuffer(buf, ".pdf");
  assert.match(text, /TOR ตัวอย่าง/);
  assert.match(text, /2\.5 GHz/);
});

test("extractTextFromBuffer returns text for a DOCX", async () => {
  const buf = await readFile(path.resolve("test/fixtures/tor-sample.docx"));
  const text = await extractTextFromBuffer(buf, ".docx");
  assert.match(text, /TOR sample DOCX/);
  assert.match(text, /CPU >= 2\.5 GHz/);
});

test("extractTextFromBuffer passes through plain text for .txt and .md", async () => {
  const buf = Buffer.from("hello world", "utf8");
  assert.equal(await extractTextFromBuffer(buf, ".txt"), "hello world");
  assert.equal(await extractTextFromBuffer(buf, ".md"), "hello world");
});

test("extractTextFromBuffer rejects unsupported extensions", async () => {
  await assert.rejects(
    () => extractTextFromBuffer(Buffer.from("x"), ".exe"),
    /Unsupported extension: \.exe/
  );
});

test("extractTextFromBuffer returns empty string for a scanned PDF", async () => {
  const buf = await readFile(path.resolve("test/fixtures/tor-sample.scan.pdf"));
  const text = await extractTextFromBuffer(buf, ".pdf");
  assert.equal(text.trim().length, 0);
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `node --test test/unit/tor.test.js`
Expected: all 5 tests fail with "extractTextFromBuffer is not a function".

- [ ] **Step 4: Implement `extractTextFromBuffer`**

Open `knowledge_base/raw-import-lib.js`, find the existing `extractTextFromFile` (around line 97), and append this new export immediately after it. Use the same `getDependency`, `cleanText`, `withTimeout`, and `PARSE_TIMEOUT_MS` helpers that already exist in the file — do not re-import or re-declare them.

```js
export async function extractTextFromBuffer(buffer, extension) {
  const ext = String(extension || "").toLowerCase();

  if (ext === ".md" || ext === ".txt") {
    return cleanText(buffer.toString("utf8"));
  }

  if (ext === ".pdf") {
    const pdfParse = getDependency("pdf-parse");
    try {
      const result = await withTimeout(pdfParse(buffer), PARSE_TIMEOUT_MS, "<buffer>.pdf");
      // Unlike extractTextFromFile we do NOT throw on empty text — the caller
      // (POST /api/tor/extract) treats "empty" as the scan-detection signal.
      return cleanText(result.text || "");
    } catch (error) {
      if (error.message.includes("Parse timeout")) {
        throw new Error(`PDF is too complex to parse within ${PARSE_TIMEOUT_MS}ms.`);
      }
      throw new Error(`PDF parsing failed: ${error.message}`);
    }
  }

  if (ext === ".docx") {
    const mammoth = getDependency("mammoth");
    try {
      const result = await withTimeout(mammoth.extractRawText({ buffer }), PARSE_TIMEOUT_MS, "<buffer>.docx");
      return cleanText(result.value || "");
    } catch (error) {
      throw new Error(`DOCX parse failed: ${error.message}`);
    }
  }

  throw new Error(`Unsupported extension: ${ext}`);
}
```

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `node --test test/unit/tor.test.js`
Expected: all 5 tests pass.

- [ ] **Step 6: Run the full suite to confirm no regression**

Run: `npm test`
Expected: total increases by 5, 0 failures.

- [ ] **Step 7: Commit + push + verify deploy**

```bash
git add knowledge_base/raw-import-lib.js test/unit/tor.test.js test/fixtures/tor-sample.pdf test/fixtures/tor-sample.scan.pdf test/fixtures/tor-sample.docx
git commit -m "feat(tor): extractTextFromBuffer helper for in-memory TOR extraction"
git push origin master
```

Then poll Render until the new deploy reaches `status: "live"` (use `mcp__render__list_deploys` with `serviceId: srv-d7chm2e7r5hc73fpjp10`). Do not continue until `live`.

- [ ] **Step 8: Production verification**

No user-facing change in this task. Verify the service still responds:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://ai-presale-system.onrender.com/chat
```

Expected: `200`.

---

## Task 2: `POST /api/tor/extract` endpoint

**Files:**
- Modify: `routes/tor.js`
- Test: `test/unit/tor.test.js` (extend)

- [ ] **Step 1: Add the failing test**

Append to `test/unit/tor.test.js`. This test invokes the route handler directly rather than spinning up a server.

```js
import http from "node:http";
const { handle: handleTor } = await import("../../routes/tor.js");

function mockRes() {
  let status = 0, headers = {}, body = "";
  return {
    writeHead(code, hdrs) { status = code; Object.assign(headers, hdrs || {}); },
    setHeader(k, v) { headers[k] = v; },
    write(chunk) { body += chunk; },
    end(chunk) { if (chunk) body += chunk; },
    get status() { return status; },
    get body() { return body; },
    get headers() { return headers; }
  };
}

function mockReq({ method, url, body, cookies = {} }) {
  const headers = { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ") };
  const req = new http.IncomingMessage();
  req.method = method;
  req.url = url;
  req.headers = headers;
  // Simulate body
  const payload = Buffer.from(JSON.stringify(body));
  process.nextTick(() => { req.emit("data", payload); req.emit("end"); });
  return req;
}

test("POST /api/tor/extract returns 401 without auth", async () => {
  const req = mockReq({ method: "POST", url: "/api/tor/extract", body: { file_name: "x.txt", content_base64: Buffer.from("hi").toString("base64") } });
  const res = mockRes();
  await handleTor(req, new URL("https://x" + req.url), res);
  assert.equal(res.status, 401);
});
```

Note: if the existing test harness already provides auth helpers (see `test/auth.test.js`), use them instead of re-implementing `mockReq`. Add an authenticated test that expects `{ ok: true, text: "hi" }` once auth is wired in.

- [ ] **Step 2: Run the test to confirm it fails**

Run: `node --test test/unit/tor.test.js`
Expected: fail with "Cannot POST /api/tor/extract" or similar (route not registered).

- [ ] **Step 3: Implement the extract route**

Open `routes/tor.js`. Add these imports at the top (alongside the existing imports):

```js
import { extractTextFromBuffer } from '../knowledge_base/raw-import-lib.js';
```

Add inside `handle(request, url, response)`, **before** the existing `if (request.method === "POST" && url.pathname === "/api/tor")` block:

```js
if (request.method === "POST" && url.pathname === "/api/tor/extract") {
  if (!requireUserAuth(request, response)) return true;
  try {
    const payload = await parseBody(request);
    const fileName = String(payload?.file_name || "").trim();
    const b64 = String(payload?.content_base64 || "").replace(/^data:[^;]+;base64,/, "");
    if (!fileName) return json(response, 400, { ok: false, error: "file_name is required" }), true;
    if (!b64) return json(response, 400, { ok: false, error: "content_base64 is required" }), true;

    const ext = (fileName.match(/\.[^.]+$/) || [""])[0].toLowerCase();
    const allowed = new Set([".pdf", ".docx", ".txt", ".md"]);
    if (!allowed.has(ext)) {
      return json(response, 400, { ok: false, error: `Unsupported file type: ${ext}. Allowed: ${[...allowed].join(", ")}` }), true;
    }

    const padding = (b64.match(/=+$/) || [""])[0].length;
    const approxBytes = Math.floor((b64.length * 3) / 4) - padding;
    const MAX = 15 * 1024 * 1024;
    if (approxBytes > MAX) {
      return json(response, 400, { ok: false, error: `File too large: ${(approxBytes / 1024 / 1024).toFixed(1)}MB exceeds 15MB limit` }), true;
    }

    const buffer = Buffer.from(b64, "base64");
    const text = await extractTextFromBuffer(buffer, ext);

    if (ext === ".pdf" && text.trim().length < 100) {
      return json(response, 200, { ok: true, text: "", warning: "PDF อาจเป็น scan image — ยังไม่รองรับ OCR ใน MVP. กรุณา paste ข้อความเอง" }), true;
    }

    return json(response, 200, { ok: true, text }), true;
  } catch (error) {
    return json(response, 400, { ok: false, error: `ไม่สามารถอ่านไฟล์ได้: ${error.message}` }), true;
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test test/unit/tor.test.js`
Expected: the 401-without-auth test passes.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 0 failures, count increased.

- [ ] **Step 6: Commit + push + verify deploy live**

```bash
git add routes/tor.js test/unit/tor.test.js
git commit -m "feat(tor): POST /api/tor/extract endpoint with scan detection + size/ext guard"
git push origin master
```

Poll Render until the new deploy is `live`.

- [ ] **Step 7: Production verification**

Log in and exercise three cases:

```bash
# login (user2 — engineer in Alpha, already seeded)
curl -s -c /tmp/c.txt -X POST https://ai-presale-system.onrender.com/api/auth/login \
  -H "Content-Type: application/json" -d '{"username":"user2","password":"pass1234"}' | head -c 100; echo

# valid .txt upload
B64=$(printf 'hello TOR world' | base64 -w0)
curl -s -b /tmp/c.txt -X POST https://ai-presale-system.onrender.com/api/tor/extract \
  -H "Content-Type: application/json" \
  -d "{\"file_name\":\"tor.txt\",\"content_base64\":\"$B64\"}" -w "\nHTTP %{http_code}\n"

# bad extension
curl -s -b /tmp/c.txt -X POST https://ai-presale-system.onrender.com/api/tor/extract \
  -H "Content-Type: application/json" \
  -d "{\"file_name\":\"evil.exe\",\"content_base64\":\"$B64\"}" -w "\nHTTP %{http_code}\n"

# unauthenticated
curl -s -X POST https://ai-presale-system.onrender.com/api/tor/extract \
  -H "Content-Type: application/json" \
  -d "{\"file_name\":\"tor.txt\",\"content_base64\":\"$B64\"}" -w "\nHTTP %{http_code}\n"
```

Expected: 200 with `{"ok":true,"text":"hello TOR world"}`; 400 with `"Unsupported file type"`; 401 with `"Authentication required"`.

---

## Task 3: Agent schema + prompt for citations

**Files:**
- Modify: `agents/tor.js` (the `torComplianceSchema` constant, roughly lines 59–96)
- Modify: `agents/_prompts/tor_compliance.md`

- [ ] **Step 1: Extend `torComplianceSchema`**

In `agents/tor.js`, update the `compliance_checks` items to include two new required fields:

```js
compliance_checks: {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    properties: {
      spec_label: { type: "string" },
      tor_requirement: { type: "string" },
      product_value: { type: "string" },
      status: { type: "string" },
      note: { type: "string" },
      evidence_quote: { type: "string" },
      evidence_source_file: { type: "string" }
    },
    required: ["spec_label", "tor_requirement", "product_value", "status", "note",
               "evidence_quote", "evidence_source_file"]
  }
}
```

Also update the `mockResponseFactory` at the bottom of `runTorComplianceItemAgent` so mock mode returns the new fields:

```js
compliance_checks: item.specs.map(s => ({
  spec_label: s.label,
  tor_requirement: `${s.operator} ${s.value} ${s.unit}`,
  product_value: `${s.value} ${s.unit} (mock)`,
  status: "review",
  note: "Mock mode — กรุณาเพิ่ม datasheet ใน KB",
  evidence_quote: "",
  evidence_source_file: ""
})),
```

- [ ] **Step 2: Update the prompt**

Open `agents/_prompts/tor_compliance.md`. At the end of the existing instructions, add a new section:

```markdown

## Evidence citation (REQUIRED)

For every compliance_check, you MUST populate:
- `evidence_quote`: a **verbatim** passage copied character-for-character from the `[KNOWLEDGE BASE — Product Datasheets]` block above. Do not paraphrase. Do not translate. Quote length: 20–200 characters, enough to prove the product meets the requirement.
- `evidence_source_file`: the exact filename shown in the `### <title>` heading of the chunk that contains your quote. If the chunk does not list a filename, use the heading text verbatim.

If you cannot find a verbatim passage that supports the check, set `status: "review"`, `evidence_quote: ""`, `evidence_source_file: ""`, and explain in `note` that the KB does not contain the information.

Never invent a quote. Never fix up grammar, spacing, or numbers in the quote. The presale engineer will verify each quote against the original datasheet.
```

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: all tests pass. Existing TOR pipeline tests (if any hit the mock response) now assert the two new fields exist — if any fixture-based test breaks, update its snapshot to include the empty strings.

- [ ] **Step 4: Commit + push + verify live**

```bash
git add agents/tor.js agents/_prompts/tor_compliance.md
git commit -m "feat(tor): add evidence_quote + evidence_source_file to compliance schema + prompt"
git push origin master
```

Poll until `live`.

- [ ] **Step 5: Production verification**

Run the existing TOR flow against production with a small paste (this exercises the new schema end-to-end; mock mode is NOT used in prod so the real LLM must return the new fields):

```bash
curl -s -b /tmp/c.txt -N -X POST https://ai-presale-system.onrender.com/api/tor \
  -H "Content-Type: application/json" \
  -d '{"tor_text":"1. เครื่องแม่ข่าย 1 เครื่อง — CPU >= 2.5 GHz, RAM >= 32 GB"}' \
  | tee /tmp/tor_stream.txt | tail -c 4000
```

Inspect the last `type: "done"` event — each `compliance_checks[]` entry must now include `evidence_quote` and `evidence_source_file`.

---

## Task 4: Quote verification (anti-hallucination)

**Files:**
- Modify: `agents/tor.js` (add helper + call it inside `runTorComplianceItemAgent`)
- Test: `test/unit/tor.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/tor.test.js`:

```js
const { verifyEvidenceQuotes } = await import("../../agents/tor.js");

test("verifyEvidenceQuotes keeps status when quote is a substring of a KB chunk", () => {
  const chunks = [{ title: "Dell R760", content: "Intel Xeon Gold 6430 2.1 GHz 32 cores" }];
  const item = {
    compliance_checks: [{
      spec_label: "CPU",
      tor_requirement: ">= 2.0 GHz",
      product_value: "2.1 GHz",
      status: "comply",
      note: "",
      evidence_quote: "Intel Xeon Gold 6430 2.1 GHz",
      evidence_source_file: "Dell R760"
    }],
    presale_review_notes: []
  };
  const out = verifyEvidenceQuotes(item, chunks);
  assert.equal(out.compliance_checks[0].status, "comply");
  assert.equal(out.presale_review_notes.length, 0);
});

test("verifyEvidenceQuotes downgrades to review when quote is not found", () => {
  const chunks = [{ title: "Dell R760", content: "Intel Xeon Gold 6430" }];
  const item = {
    compliance_checks: [{
      spec_label: "CPU",
      tor_requirement: ">= 2.0 GHz",
      product_value: "2.1 GHz",
      status: "comply",
      note: "",
      evidence_quote: "AMD EPYC 9754 128 cores at 2.25 GHz",
      evidence_source_file: "Dell R760"
    }],
    presale_review_notes: []
  };
  const out = verifyEvidenceQuotes(item, chunks);
  assert.equal(out.compliance_checks[0].status, "review");
  assert.match(out.presale_review_notes[0], /could not be verified/i);
});

test("verifyEvidenceQuotes preserves not_comply status even if unverified", () => {
  const chunks = [{ title: "X", content: "y" }];
  const item = {
    compliance_checks: [{
      spec_label: "CPU", tor_requirement: "", product_value: "", status: "not_comply", note: "",
      evidence_quote: "made up", evidence_source_file: ""
    }],
    presale_review_notes: []
  };
  const out = verifyEvidenceQuotes(item, chunks);
  assert.equal(out.compliance_checks[0].status, "not_comply");
});

test("verifyEvidenceQuotes tolerates whitespace differences", () => {
  const chunks = [{ title: "X", content: "Intel   Xeon\tGold  6430  2.1 GHz" }];
  const item = {
    compliance_checks: [{
      spec_label: "CPU", tor_requirement: "", product_value: "", status: "comply", note: "",
      evidence_quote: "Intel Xeon Gold 6430 2.1 GHz", evidence_source_file: "X"
    }],
    presale_review_notes: []
  };
  const out = verifyEvidenceQuotes(item, chunks);
  assert.equal(out.compliance_checks[0].status, "comply");
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `node --test test/unit/tor.test.js`
Expected: 4 new tests fail with "verifyEvidenceQuotes is not a function".

- [ ] **Step 3: Implement `verifyEvidenceQuotes` and wire it in**

In `agents/tor.js`, add this exported helper near the top (after imports):

```js
export function verifyEvidenceQuotes(item, chunks) {
  const normalized = chunks.map(c => normalizeWhitespace(String(c.content || "")));
  const checks = (item.compliance_checks || []).map(check => {
    const quote = String(check.evidence_quote || "").trim();
    if (!quote) return check; // empty quote already signals "no evidence"
    const nq = normalizeWhitespace(quote);
    const found = normalized.some(c => c.includes(nq));
    if (found) return check;
    // Preserve not_comply; only downgrade comply/comply_with_review
    if (check.status === "not_comply") return check;
    return { ...check, status: "review" };
  });
  const reviewNotes = [...(item.presale_review_notes || [])];
  (item.compliance_checks || []).forEach((orig, i) => {
    if (!orig.evidence_quote) return;
    const still = checks[i];
    if (still.status !== orig.status) {
      reviewNotes.push(`Evidence quote for ${orig.spec_label} could not be verified against KB — check datasheet manually`);
    }
  });
  return { ...item, compliance_checks: checks, presale_review_notes: reviewNotes };
}

function normalizeWhitespace(s) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}
```

Now thread the verifier into `runTorComplianceItemAgent`. Locate the section that builds `kbContext` (currently around line 136–142). Keep the chunks array around:

```js
async function runTorComplianceItemAgent(item, options = {}) {
  const prompt = await readFile(path.join(__dirname, "_prompts", "tor_compliance.md"), "utf8");
  const query = buildKbQuery(item.category, item.specs);
  let kbContext = "";
  let chunks = [];
  try {
    const result = await getKnowledge({ use_cases: [query], _kb_hint: query }, options.orgId ?? null);
    chunks = result.chunks || [];
    if (chunks.length > 0) {
      kbContext = `\n\n[KNOWLEDGE BASE — Product Datasheets]\nUse these spec sheets to find compliant products. Only recommend models that appear here.\n\n${chunks.map(c => `### ${c.title}\n${c.content}`).join("\n\n")}`;
    }
  } catch { /* KB unavailable */ }

  const userPrompt = JSON.stringify(item, null, 2);

  const raw = await withAgentLogging(/* ...existing logger config... */, () =>
    generateJsonWithOpenAI({
      systemPrompt: prompt + kbContext,
      userPrompt,
      model: config.openai.models.specialist,
      textFormat: torComplianceSchema,
      maxOutputTokens: 2000,
      mockResponseFactory: async () => ({ /* ...existing mock... */ })
    })
  );

  return verifyEvidenceQuotes(raw, chunks);
}
```

When editing, keep the existing `withAgentLogging` metadata object intact; only change the tail of the function to capture `raw` and pass through `verifyEvidenceQuotes`.

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `node --test test/unit/tor.test.js`
Expected: all 4 new tests pass.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 6: Commit + push + verify live**

```bash
git add agents/tor.js test/unit/tor.test.js
git commit -m "feat(tor): verify LLM evidence quotes against KB, downgrade unverified to review"
git push origin master
```

Poll until `live`.

- [ ] **Step 7: Production verification**

Run the same TOR streaming command from Task 3 step 5 again. In the final `done` event, find a check where `status: "comply"`. Copy the `evidence_quote`. Search for that exact string inside `knowledge_base/` raw files (via `grep`) — it should match. If you find a check where the quote does not match any KB file, the verifier should have already set `status: "review"`; if not, something is wrong.

---

## Task 5: Excel exporter

**Files:**
- Modify: `lib/tor-export.js`
- Test: `test/unit/tor.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/unit/tor.test.js`:

```js
const { generateTorComplianceXlsx } = await import("../../lib/tor-export.js");

test("generateTorComplianceXlsx returns a valid xlsx buffer", async () => {
  const report = {
    project_name: "Test",
    tor_id: "t1",
    items: [{
      item_no: "1",
      category: "Server",
      quantity: 2,
      recommended_model: "Dell R760",
      model_spec_summary: "Xeon 2.1GHz 64GB",
      compliance_checks: [{
        spec_label: "CPU", tor_requirement: ">=2.0 GHz", product_value: "2.1 GHz",
        status: "comply", note: "", evidence_quote: "Intel Xeon 2.1 GHz", evidence_source_file: "r760.pdf"
      }],
      overall_status: "comply",
      compliance_statement_th: "ผ่าน",
      presale_review_notes: [],
      kb_coverage: "full"
    }]
  };
  const buf = await generateTorComplianceXlsx(report);
  assert.ok(Buffer.isBuffer(buf));
  // xlsx files start with the PK zip magic
  assert.equal(buf.slice(0, 2).toString(), "PK");
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `node --test test/unit/tor.test.js`
Expected: fail with "generateTorComplianceXlsx is not a function".

- [ ] **Step 3: Implement the exporter**

Open `lib/tor-export.js`. Add at the top:

```js
import ExcelJS from "exceljs";
```

Append this exported function:

```js
export async function generateTorComplianceXlsx(report) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Franky-Presale";
  wb.created = new Date();
  const ws = wb.addWorksheet(`TOR Compliance — ${String(report.project_name || "").slice(0, 25)}`);

  ws.columns = [
    { header: "Item", key: "item_no", width: 8 },
    { header: "Category", key: "category", width: 18 },
    { header: "Product", key: "product", width: 22 },
    { header: "Spec", key: "spec_label", width: 18 },
    { header: "Requirement", key: "requirement", width: 20 },
    { header: "Product value", key: "product_value", width: 22 },
    { header: "Status", key: "status", width: 12 },
    { header: "Evidence quote", key: "quote", width: 48 },
    { header: "Source", key: "source", width: 24 },
    { header: "Note", key: "note", width: 32 }
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: "middle" };

  for (const item of report.items || []) {
    for (const check of item.compliance_checks || []) {
      const row = ws.addRow({
        item_no: item.item_no,
        category: item.category,
        product: item.recommended_model,
        spec_label: check.spec_label,
        requirement: check.tor_requirement,
        product_value: check.product_value,
        status: check.status,
        quote: check.evidence_quote,
        source: check.evidence_source_file,
        note: check.note
      });
      row.alignment = { wrapText: true, vertical: "top" };
      const fillColor =
        check.status === "comply" ? "FFD9F2E6" :
        check.status === "not_comply" ? "FFF9D7D7" :
        check.status === "review" ? "FFFFF1C2" : null;
      if (fillColor) {
        row.getCell("status").fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillColor } };
      }
    }
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test test/unit/tor.test.js`
Expected: pass.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 6: Commit + push + verify live**

```bash
git add lib/tor-export.js test/unit/tor.test.js
git commit -m "feat(tor): XLSX exporter for TOR compliance reports"
git push origin master
```

Poll until `live`. No live endpoint yet — that ships in Task 7. Next production verification runs there.

---

## Task 6: PDF exporter

**Files:**
- Modify: `lib/pdf-export.js`
- Test: `test/unit/tor.test.js`

- [ ] **Step 1: Write the failing test**

Append:

```js
const { generateTorCompliancePdf } = await import("../../lib/pdf-export.js");

test("generateTorCompliancePdf returns a valid PDF buffer", async () => {
  const report = {
    project_name: "Test",
    tor_id: "t1",
    items: [{
      item_no: "1", category: "Server", quantity: 2,
      recommended_model: "Dell R760", model_spec_summary: "Xeon 2.1GHz 64GB",
      compliance_checks: [{
        spec_label: "CPU", tor_requirement: ">=2.0 GHz", product_value: "2.1 GHz",
        status: "comply", note: "",
        evidence_quote: "Intel Xeon 2.1 GHz", evidence_source_file: "r760.pdf"
      }],
      overall_status: "comply", compliance_statement_th: "ผ่าน",
      presale_review_notes: [], kb_coverage: "full"
    }]
  };
  const buf = await generateTorCompliancePdf(report);
  assert.ok(Buffer.isBuffer(buf));
  assert.equal(buf.slice(0, 4).toString(), "%PDF");
}).timeout(60000); // puppeteer cold start
```

If `node:test` does not support `.timeout()`, set the timeout via the test options: `test("...", { timeout: 60000 }, async () => { ... })`.

- [ ] **Step 2: Run to confirm it fails**

Run: `node --test test/unit/tor.test.js`
Expected: fail with "generateTorCompliancePdf is not a function".

- [ ] **Step 3: Implement the PDF exporter**

In `lib/pdf-export.js`, below the `PdfExportEngine` class, add a module-level export (kept separate from the class to make import/testing trivial):

```js
export async function generateTorCompliancePdf(report) {
  const statusFill = {
    comply: "#D9F2E6",
    not_comply: "#F9D7D7",
    review: "#FFF1C2"
  };

  const itemsHtml = (report.items || []).map(item => `
    <h2>Item ${escapeHtml(item.item_no)} — ${escapeHtml(item.category)} × ${item.quantity || 0}</h2>
    <p><strong>Recommended:</strong> ${escapeHtml(item.recommended_model || "—")}</p>
    <p><em>${escapeHtml(item.model_spec_summary || "")}</em></p>
    <table>
      <thead>
        <tr>
          <th>Spec</th><th>Requirement</th><th>Product value</th>
          <th>Status</th><th>Evidence quote</th><th>Source</th>
        </tr>
      </thead>
      <tbody>
        ${(item.compliance_checks || []).map(c => `
          <tr>
            <td>${escapeHtml(c.spec_label)}</td>
            <td>${escapeHtml(c.tor_requirement)}</td>
            <td>${escapeHtml(c.product_value)}</td>
            <td style="background:${statusFill[c.status] || "transparent"}">${escapeHtml(c.status)}</td>
            <td>${escapeHtml(c.evidence_quote || "—")}</td>
            <td>${escapeHtml(c.evidence_source_file || "—")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    ${(item.presale_review_notes || []).length > 0 ? `
      <p><strong>Presale review notes:</strong></p>
      <ul>${item.presale_review_notes.map(n => `<li>${escapeHtml(n)}</li>`).join("")}</ul>
    ` : ""}
  `).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { font-family: 'Sarabun', 'Calibri', sans-serif; color: #334155; padding: 2cm; }
    h1 { color: #1A3A5C; border-bottom: 3px solid #0E7490; padding-bottom: 6px; }
    h2 { color: #1A3A5C; margin-top: 24px; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12px; }
    th { background: #1A3A5C; color: white; padding: 8px; text-align: left; }
    td { padding: 6px; border: 1px solid #ddd; vertical-align: top; }
    .footer { margin-top: 40px; font-size: 11px; color: #64748B; }
  </style><link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet"></head>
  <body>
    <h1>TOR Compliance Report — ${escapeHtml(report.project_name || "")}</h1>
    <p>Generated: ${new Date().toISOString()}</p>
    ${itemsHtml}
    <p class="footer">Generated by Franky-Presale — ทุกรายการต้องได้รับการตรวจสอบโดย presale engineer ก่อนส่งลูกค้า</p>
  </body></html>`;

  // Local import to avoid hoisting puppeteer into modules that don't need it
  const { default: puppeteer } = await import("puppeteer");
  const browser = await puppeteer.launch({ headless: "shell", args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    return await page.pdf({ format: "A4", printBackground: true, margin: { top: "2cm", right: "2cm", bottom: "2cm", left: "2cm" } });
  } finally {
    await browser.close();
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test test/unit/tor.test.js`
Expected: pass. (Local machine must have chromium available for puppeteer; Render already has it from the existing proposal-PDF flow.)

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 6: Commit + push + verify live**

```bash
git add lib/pdf-export.js test/unit/tor.test.js
git commit -m "feat(tor): PDF exporter via puppeteer HTML-to-PDF (Sarabun + Calibri)"
git push origin master
```

Poll until `live`. Verification runs in Task 7.

---

## Task 7: Export routes

**Files:**
- Modify: `routes/tor.js`

- [ ] **Step 1: Add the routes**

At the top of `routes/tor.js`, add imports:

```js
import { generateTorComplianceXlsx, generateTorCompliancePdf } from '../lib/pdf-export.js';
import { generateTorComplianceXlsx as xlsxGen } from '../lib/tor-export.js';
```

Wait — two functions with the same name exist. Pick the right imports:

```js
import { generateTorComplianceXlsx } from '../lib/tor-export.js';
import { generateTorCompliancePdf } from '../lib/pdf-export.js';
```

Inside `handle(...)`, **after** the existing CSV export block (around line 53), add:

```js
if (request.method === "GET" && url.pathname.match(/^\/api\/tor\/[^/]+\/export\.xlsx$/)) {
  if (!requireUserAuth(request, response)) return true;
  const torId = url.pathname.split("/")[3];
  const entry = torReports.get(torId);
  if (!entry) { json(response, 404, { ok: false, error: "TOR report not found or expired" }); return true; }
  try {
    const buffer = await generateTorComplianceXlsx(entry.report);
    const filename = getTorExportFilename(entry.report.project_name).replace(/\.csv$/, ".xlsx");
    response.writeHead(200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
    });
    response.end(buffer);
  } catch (error) {
    json(response, 500, { ok: false, error: error.message });
  }
  return true;
}

if (request.method === "GET" && url.pathname.match(/^\/api\/tor\/[^/]+\/export\.pdf$/)) {
  if (!requireUserAuth(request, response)) return true;
  const torId = url.pathname.split("/")[3];
  const entry = torReports.get(torId);
  if (!entry) { json(response, 404, { ok: false, error: "TOR report not found or expired" }); return true; }
  try {
    const buffer = await generateTorCompliancePdf(entry.report);
    const filename = getTorExportFilename(entry.report.project_name).replace(/\.csv$/, ".pdf");
    response.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
    });
    response.end(buffer);
  } catch (error) {
    json(response, 500, { ok: false, error: error.message });
  }
  return true;
}
```

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: 0 failures (no new unit tests here — routes are exercised in production verification).

- [ ] **Step 3: Commit + push + verify live**

```bash
git add routes/tor.js
git commit -m "feat(tor): /api/tor/:id/export.{xlsx,pdf} routes"
git push origin master
```

Poll until `live`.

- [ ] **Step 4: Production verification**

End-to-end: generate a report, then download both new formats.

```bash
# (re-login if needed)
curl -s -c /tmp/c.txt -X POST https://ai-presale-system.onrender.com/api/auth/login \
  -H "Content-Type: application/json" -d '{"username":"user2","password":"pass1234"}' > /dev/null

# generate a TOR report
TOR_ID=$(curl -s -b /tmp/c.txt -N -X POST https://ai-presale-system.onrender.com/api/tor \
  -H "Content-Type: application/json" \
  -d '{"tor_text":"1. Server 1 unit — CPU >= 2.0 GHz, RAM >= 32 GB"}' \
  | tee /tmp/tor_stream.txt \
  | python3 -c "import sys,json
for ln in sys.stdin:
  if ln.startswith('data:'):
    d=json.loads(ln[5:].strip())
    if d.get('type')=='done' and d.get('ok'):
      print(d['report']['tor_id']); break")
echo "tor_id=$TOR_ID"

# xlsx
curl -s -b /tmp/c.txt -o /tmp/out.xlsx -w "HTTP %{http_code} | %{size_download}B\n" \
  "https://ai-presale-system.onrender.com/api/tor/$TOR_ID/export.xlsx"
file /tmp/out.xlsx

# pdf
curl -s -b /tmp/c.txt -o /tmp/out.pdf -w "HTTP %{http_code} | %{size_download}B\n" \
  "https://ai-presale-system.onrender.com/api/tor/$TOR_ID/export.pdf"
file /tmp/out.pdf
```

Expected:
- HTTP 200 for both
- `file /tmp/out.xlsx` says "Microsoft OOXML" / "Zip archive"
- `file /tmp/out.pdf` says "PDF document"
- Open one of each locally (if possible) to eyeball formatting

---

## Task 8: Frontend — 📎 file button inside TOR panel

**Files:**
- Modify: `chat/chat.html`
- Modify: `chat/chat.js`

- [ ] **Step 1: Add the button and hidden input to `chat/chat.html`**

Find the TOR panel block (around line 1369) and add the file button between the textarea and the submit button:

```html
<div class="tor-panel" id="tor-panel">
  <div class="tor-panel-label">วาง TOR คุณลักษณะเฉพาะ (ภาษาไทย/อังกฤษ)</div>
  <div class="tor-panel-hint">Copy ส่วน "คุณลักษณะเฉพาะ" จาก TOR ของราชการ แล้ว paste ที่นี่ — หรือแนบไฟล์ TOR ได้โดยตรง</div>
  <textarea class="tor-textarea" id="tor-textarea" placeholder="..."></textarea>
  <div style="display:flex; gap:8px; align-items:center;">
    <button class="tor-submit-btn" id="tor-file-btn" type="button" style="background:transparent;color:var(--ink-dim);border:1px solid var(--border-strong);">📎 แนบไฟล์ TOR</button>
    <input type="file" id="tor-file-input" accept=".pdf,.docx,.txt,.md" style="display:none" />
    <button class="tor-submit-btn" id="tor-submit-btn">ตรวจสอบ TOR Compliance</button>
  </div>
</div>
```

- [ ] **Step 2: Add the handler to `chat/chat.js`**

Find the block that looks up `#tor-submit-btn` (around line 733) and add the file-button wiring nearby:

```js
const torFileBtn = document.getElementById("tor-file-btn");
const torFileInput = document.getElementById("tor-file-input");
const torTextarea = document.getElementById("tor-textarea");
const torErrorBanner = document.getElementById("error-banner"); // reuse existing banner

function showTorMessage(text, isError) {
  if (!torErrorBanner) return alert(text);
  torErrorBanner.textContent = text;
  torErrorBanner.style.display = "block";
  torErrorBanner.style.background = isError ? "#fdecea" : "#fff4d6";
  torErrorBanner.style.color = isError ? "#b71c1c" : "#7a5a00";
  setTimeout(() => { torErrorBanner.style.display = "none"; }, 8000);
}

if (torFileBtn && torFileInput && torTextarea) {
  torFileBtn.addEventListener("click", () => torFileInput.click());
  torFileInput.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      showTorMessage(`ไฟล์ใหญ่เกิน 15MB (${(file.size/1024/1024).toFixed(1)}MB)`, true);
      return;
    }
    const prev = torFileBtn.textContent;
    torFileBtn.disabled = true;
    torFileBtn.textContent = "⏳ กำลัง extract...";
    try {
      const b64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1] || "");
        r.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
        r.readAsDataURL(file);
      });
      const res = await fetch("/api/tor/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ file_name: file.name, content_base64: b64 })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        showTorMessage(data.error || `Extract ล้มเหลว (HTTP ${res.status})`, true);
        return;
      }
      if (data.warning) {
        showTorMessage(data.warning, false);
      }
      if (data.text) {
        torTextarea.value = data.text;
        torTextarea.focus();
      }
    } catch (err) {
      showTorMessage(err.message || "Extract ล้มเหลว", true);
    } finally {
      torFileBtn.disabled = false;
      torFileBtn.textContent = prev;
    }
  });
}
```

- [ ] **Step 3: Run the full suite (smoke)**

Run: `npm test`
Expected: 0 failures (HTML/JS not unit-tested; guards against regressions in adjacent files).

- [ ] **Step 4: Commit + push + verify live**

```bash
git add chat/chat.html chat/chat.js
git commit -m "feat(tor): 📎 file attach button in TOR panel — auto-fill textarea"
git push origin master
```

Poll until `live`.

- [ ] **Step 5: Production verification (manual)**

Open https://ai-presale-system.onrender.com/chat in a browser, log in as `user2` / `pass1234`, open **📋 TOR Mode**, click **📎 แนบไฟล์ TOR**, upload `test/fixtures/tor-sample.pdf`. Confirm the textarea fills with the PDF's text. Upload `tor-sample.scan.pdf` — confirm the amber banner shows the scan warning and the textarea stays empty. Upload an `.exe` renamed to `.pdf` at most once to sanity-check the extension gate.

---

## Task 9: Frontend — Export Excel + PDF buttons in TOR result

**Files:**
- Modify: `chat/chat.js` (the `renderTorTable(report)` call site at line 831)

- [ ] **Step 1: Locate the current single-link rendering**

In `chat/chat.js` around line 831, the assistant message is built with a single `<a href="/api/tor/.../export">Export Excel (.csv)</a>` anchor. Replace the anchor with a three-button group that calls the three export endpoints.

- [ ] **Step 2: Replace with three buttons**

```js
msg.innerHTML = `<div class="message-label">Franky-Presale — TOR Compliance</div>
<div class="bubble assistant">
  ${renderTorTable(report)}
  <div class="export-actions" style="margin-top:8px">
    <a href="/api/tor/${encodeURIComponent(report.tor_id)}/export" download class="download-btn">
      <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>CSV
    </a>
    <a href="/api/tor/${encodeURIComponent(report.tor_id)}/export.xlsx" download class="download-btn">
      <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>Excel
    </a>
    <a href="/api/tor/${encodeURIComponent(report.tor_id)}/export.pdf" download class="download-btn">
      <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>PDF
    </a>
  </div>
</div>`;
```

(`.export-actions` CSS already exists at `chat/chat.html:545`.)

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 4: Commit + push + verify live**

```bash
git add chat/chat.js
git commit -m "feat(tor): Excel + PDF export buttons next to CSV in TOR result"
git push origin master
```

Poll until `live`.

- [ ] **Step 5: Production verification (manual)**

Reload `/chat`, paste a short TOR into the textarea, click **ตรวจสอบ TOR Compliance**, wait for the result, and click each of the three download buttons (CSV / Excel / PDF) in turn. Confirm:
- CSV downloads and opens in Excel
- Excel (.xlsx) opens in Excel with colored status cells (green/red/amber)
- PDF opens in a PDF viewer, readable Thai + English, status cells colored, one evidence quote per row

This is the last production check. Feature is complete when all three downloads succeed and each compliance_check shows a non-empty `evidence_quote` (unless the KB legitimately lacked information — in which case the row should be `status: review` with a note).

---

## Self-Review (done before handing off)

**Spec coverage:** file upload endpoint (Task 2), schema + prompt (Task 3), quote verification (Task 4), XLSX export (Task 5), PDF export (Task 6), routes (Task 7), FE upload button (Task 8), FE export buttons (Task 9), extraction helper (Task 1). Every numbered architecture point in the spec maps to a task.

**Placeholder scan:** no "TODO" / "TBD" / "fill in". Every step shows concrete code or a concrete command with expected output.

**Type consistency:** The `verifyEvidenceQuotes` helper returns `{ compliance_checks, presale_review_notes }` — matches the fields used by the exporter. The exporter reads `evidence_quote` / `evidence_source_file` / `status` / `note` exactly as the schema defines them. `getTorExportFilename` suffix-replacement (`.csv` → `.xlsx` / `.pdf`) assumes the existing helper returns a `.csv` filename; verify once in Task 7 step 1 by reading `lib/tor-export.js` briefly before editing the routes.

**Dependencies:** `pdf-parse`, `mammoth`, `exceljs`, `puppeteer`, `handlebars` are all already in `package.json` (verified). No `npm install` is required — do not add `pdfkit`.
