# TOR Compliance Upgrade — Design

**Date:** 2026-04-18
**Status:** Approved (pending user review of this spec)
**Owner:** Pitsanu

## Problem

TOR (Terms of Reference) compliance is a killer feature for SI presale: customers hand over a TOR spec and presale must prove that proposed products meet every requirement. The current system supports this only partially:

- Accepts TOR **text paste only** — no file upload for PDF / DOCX that presale actually receives
- Matches TOR items against KB and produces comply / not_comply / review status — but **without citations**. Presale cannot point to "this exact wording in the Dell R760 datasheet proves the CPU ≥ 2.5 GHz requirement"
- Only CSV export, not suitable for attaching to proposals

This upgrade delivers file upload, per-check citations (`evidence_quote` + `source_file`), and richer exports (Excel + PDF) while explicitly deferring OCR for scanned PDFs, page-number references, and datasheet highlight overlays to Wave 2.

## Scope

### In scope
- Accept TOR file upload: `.pdf` (text-based), `.docx`, `.txt`, `.md`, ≤ 15 MB
- Add `evidence_quote` + `evidence_source_file` per compliance check, with substring verification against KB chunks to prevent LLM hallucination
- Export compliance report as `.xlsx` (exceljs) and `.pdf` (pdfkit or equivalent)
- UI: add 📎 file-attach button inside the TOR panel that extracts text and auto-fills the existing textarea (user can still edit before submitting)
- UI: add "Export Excel" and "Export PDF" buttons next to existing CSV export

### Out of scope (Wave 2+)
- OCR for scanned / image PDFs (reject with a warning for now)
- Page number / section heading references (requires re-ingesting all KB with richer metadata — deferred until we have demand signal)
- Highlight overlay on original datasheet PDFs (fragile, high complexity)

## Architecture

### Backend

**1. New endpoint `POST /api/tor/extract`**
- Input: `{ file_name: string, content_base64: string }`
- Extraction pipeline reused from the admin-kb flow (`pdf-parse` for PDF, `mammoth` for DOCX, plain read for TXT / MD)
- Size cap 15 MB + extension whitelist `.pdf / .docx / .txt / .md`
- Scanned-PDF detection: if extracted text length < 100 chars, return `{ ok: true, text: "", warning: "PDF อาจเป็น scan image — ยังไม่รองรับ OCR ใน MVP" }`. User is expected to paste text manually
- Return shape: `{ ok: true, text: string, warning?: string }` or `{ ok: false, error: string }`

**2. Agent schema changes (`agents/tor.js`)**

`torComplianceSchema.compliance_checks[]` gets two new required fields:
```
evidence_quote: string          // verbatim passage from the KB chunk used
evidence_source_file: string    // source_file of that chunk
```

`tor_compliance.md` prompt is updated so the LLM is instructed to quote directly from the `[KNOWLEDGE BASE]` block it was given and to return the exact `source_file` alongside. Quotes must be verbatim, not paraphrased.

**3. Quote verification — anti-hallucination (`agents/tor.js`)**

After each `runTorComplianceItemAgent` call, before returning, iterate `compliance_checks` and verify that `evidence_quote` is a substring of at least one KB chunk that was actually passed in. Implementation:

- Normalize both the quote and each chunk content (collapse whitespace, lower-case for comparison)
- If no chunk contains the quote: set `status` to `"review"` (unless it was `"not_comply"` — preserve that), and append to `presale_review_notes`: `"Evidence quote for <spec_label> could not be verified against KB — check datasheet manually"`

This downgrade protects presale from the LLM fabricating a plausible-sounding wording that does not exist in any datasheet.

**4. Exporters (`lib/tor-export.js`)**

Two new pure functions alongside the existing CSV generator:

- `generateTorComplianceXlsx(report) → Buffer` using `exceljs`. Columns: Item # / Category / Spec / Requirement / Product model / Product value / Evidence quote / Source / Status / Note. One row per compliance_check, with item-level header rows. Cells wrap long quotes; status column uses conditional fill (green=comply, red=not_comply, amber=review).
- `generateTorCompliancePdf(report) → Buffer` using `pdfkit` (or Playwright HTML→PDF if Playwright is already in the stack). Document structure: cover page with project name + generation timestamp, one table per item (spec / requirement / product value / status / evidence quote), footer with source file list.

Existing `generateTorComplianceCsv` stays for backward compatibility.

**5. New routes (`routes/tor.js`)**

- `GET /api/tor/:id/export.xlsx` → `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- `GET /api/tor/:id/export.pdf` → `Content-Type: application/pdf`
- Existing `GET /api/tor/:id/export` continues to return CSV (no breaking change)
- All three reuse the same 24-hour in-memory `torReports` cache

### Frontend (`chat/chat.html`)

**TOR panel additions**

- New button `📎 แนบไฟล์ TOR` placed next to the existing `ตรวจสอบ TOR Compliance` submit button inside `.tor-panel`
- Hidden `<input type="file" accept=".pdf,.docx,.txt,.md">`
- On file select:
  1. Client-side 15 MB size check (early reject before upload)
  2. `FileReader.readAsDataURL` → extract base64 portion
  3. `POST /api/tor/extract`
  4. On success: populate `#tor-textarea` with the returned text; if `warning` is present, show it in the existing `#error-banner` (amber style) so the user sees scan-PDF warnings
  5. On error: show error in `#error-banner` (red style)
- Button is disabled with a spinner label (`⏳ กำลัง extract…`) while the request is in flight

**Result panel additions**

When a TOR compliance report is displayed, show three export buttons side-by-side: `Export CSV` (existing) / `Export Excel` / `Export PDF`. Each calls the corresponding `/api/tor/:id/export*` endpoint and triggers a browser download.

## Data flow

```
User drops TOR.pdf on 📎 button
  → FE: base64 encode, POST /api/tor/extract
  → BE: detect ext → pdf-parse / mammoth / plain read
  → BE: if text < 100 chars → return warning
  → FE: auto-fill tor-textarea, show warning banner if any
  → User reviews / edits text, clicks "ตรวจสอบ TOR Compliance"
  → FE: POST /api/tor (existing SSE flow)
  → BE: runTorPipeline
      → tor_parser: TOR text → items + specs
      → per item: tor_compliance agent with [KNOWLEDGE BASE] chunks
      → per check: LLM returns evidence_quote + evidence_source_file
      → quote verification: substring check against actual KB chunks
      → if verification fails → downgrade to review + add note
  → FE: render report with per-check evidence quotes
  → User clicks Export Excel / PDF
  → FE: GET /api/tor/:id/export.xlsx (or .pdf)
  → BE: generateTorCompliance{Xlsx,Pdf}(report) → buffer → stream
  → Browser downloads the file
```

## Error handling

| Condition | Surface | Behavior |
|---|---|---|
| File > 15 MB | FE + BE | Reject with explicit size in message |
| Unsupported extension | BE 400 | Return allowed list in error message |
| PDF appears scanned (text < 100 chars) | BE 200 + warning | Empty text + warning; user pastes manually |
| `pdf-parse` / `mammoth` throw | BE 400 | Return `"ไม่สามารถอ่านไฟล์ได้: <reason>"` |
| LLM returns unverifiable quote | BE (silent) | Downgrade status to `review` + add reviewer note |
| Report expired (> 24 hr) | BE 404 | Existing behavior, unchanged |
| Oversize TOR text (> ~50 pages) | BE | Respect existing `runTorPipeline` limits (no new cap introduced) |

## Testing

**Unit**
- PDF extraction smoke: a committed fixture PDF returns non-empty text
- DOCX extraction smoke: a committed fixture DOCX returns non-empty text
- Scan detection: a fixture returning `""` triggers the warning path
- Quote verification: a quote present in a chunk passes; a fake quote triggers `review` downgrade + note append
- XLSX render: a hand-constructed mock report round-trips through `generateTorComplianceXlsx` without throwing; output buffer is a valid zip (first bytes `PK`)
- PDF render: same, output buffer starts with `%PDF-`

**Integration (mock mode)**
- End-to-end `runTorPipeline` with mock LLM responses returns `compliance_checks` containing both new fields
- Full-stack: stub `/api/tor/extract` → `/api/tor` → exporters, asserting HTTP 200 on all three export URLs for the same `tor_id`

Existing tests (`test/scaffold.test.js`, `test/unit/*`) must continue to pass.

## Dependencies

New npm packages (installed as regular deps, not dev):

- `exceljs` — Excel generation (~1.5 MB)
- `pdfkit` — PDF generation (~2 MB). If Playwright turns out to already be in the stack and render HTML→PDF is preferable, use that instead and skip `pdfkit`
- `mammoth` — DOCX → plain text (~1.5 MB). Check whether `lib/admin-kb.js` / `knowledge_base/` already imports it before adding

Existing dep check needed:
- `pdf-parse` — assumed to exist because admin-kb accepts `.pdf`; verify in `package.json` before assuming

## Security / isolation

- Extraction endpoint requires `requireUserAuth` — same gate as `POST /api/tor`
- `orgId` for KB lookup continues to come from session only, never payload
- Uploaded TOR file content is **not persisted** — it is extracted to text in-memory and discarded after the response. Only the parsed TOR text and resulting report are kept (report stays in the existing 24-hour `torReports` cache)
- Quote verification uses the same KB chunks the LLM was given, ensuring the citation cannot escape the authorized org scope

## Dev plan (rough)

Detailed steps will be produced by the writing-plans skill. Rough order:

1. Check existing deps (`pdf-parse`, `mammoth`); install missing (`exceljs`, `pdfkit`, possibly `mammoth`)
2. `POST /api/tor/extract` + scan detection + tests
3. Schema + prompt changes + quote verification + tests
4. XLSX exporter + PDF exporter + routes + tests
5. FE: 📎 button + extract flow
6. FE: Export Excel / PDF buttons
7. Commit + deploy + verify in production after each step (per project feedback rule)

## Open questions (to resolve during implementation)

None blocking. A few will be decided at implementation time based on what is already in the codebase:
- Whether `pdf-parse` / `mammoth` are already installed
- Whether to pick `pdfkit` vs HTML→PDF via an existing Playwright install
