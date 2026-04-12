# Presale Expert System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four features that turn this system into a tool an SI without domain expertise can use to independently produce credible proposals for customers and formal spec sheets for distributors.

**Architecture:** All four features render or improve existing pipeline data — no new agents, no new DB tables. Feature 1 adds a new docx renderer (`lib/specsheet.js`). Feature 2 extends the existing proposal LLM schema. Feature 3 extends the discovery schema and adds UI rendering. Feature 4 adds a new frontend page using the existing `/api/projects` endpoint.

**Tech Stack:** Node.js ESM, `docx` npm package, `node:test` + `node:assert/strict` for tests, vanilla JS frontend (no framework).

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `lib/specsheet.js` | Create | Render Technical Spec Sheet .docx from structured data |
| `test/unit/specsheet.test.js` | Create | Unit tests for specsheet renderer |
| `server.js` | Modify | Add `/api/projects/:id/export/spec` + serve `/pipeline` |
| `agents/_prompts/proposal.md` | Modify | Add `why_section` instruction |
| `agents/proposal.js` | Modify | Add `why_section` to JSON schema + pass to buildProposalBuffer |
| `lib/proposal.js` | Modify | Render `why_section` as new docx section |
| `agents/_prompts/discovery.md` | Modify | Add hint emission instruction |
| `agents/discovery.js` | Modify | Add `hints` array to `discoveryQuestionsFormat` schema |
| `chat/chat.js` | Modify | Render hint collapsible + add Spec Sheet export button |
| `chat/chat.html` | Modify | Add CSS for hint collapsible |
| `pipeline/pipeline.html` | Create | Deal pipeline dashboard page |
| `pipeline/pipeline.js` | Create | Dashboard logic — fetch projects, render, handle actions |

---

## Task 1: Technical Spec Sheet renderer (`lib/specsheet.js`)

**Files:**
- Create: `lib/specsheet.js`
- Create: `test/unit/specsheet.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/unit/specsheet.test.js`:

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";

process.env.AI_PRESALE_FORCE_LOCAL = "1";

import { buildSpecSheetBuffer } from "../../lib/specsheet.js";

const mockProject = { customer_name: "Test Corp" };

const mockRequirements = {
  scale: { vm_count: 50, storage_tb: 20, users: 100, vm_count_3yr: 80 },
  existing_infrastructure: { switches: "Cisco 10G", rack_power_kw: 10, fiber_available: true, notes: null },
  budget_range: "5M THB",
  timeline: "Q3 2026",
  constraints: ["No VMware"],
  category: "HCI"
};

const mockSolution = {
  selected_option: 0,
  options: [{
    name: "Nutanix HCI",
    architecture: "HCI",
    vendor_stack: ["Nutanix", "Dell"],
    ha_level: "N+1",
    rpo_rto: "RPO 1h / RTO 4h",
    compliance_flags: []
  }]
};

describe("buildSpecSheetBuffer", () => {
  it("returns a Buffer", async () => {
    const buf = await buildSpecSheetBuffer({ project: mockProject, requirements: mockRequirements, solution: mockSolution });
    assert.ok(buf instanceof Buffer, "must return a Buffer");
  });

  it("buffer is non-empty", async () => {
    const buf = await buildSpecSheetBuffer({ project: mockProject, requirements: mockRequirements, solution: mockSolution });
    assert.ok(buf.length > 0, "buffer must not be empty");
  });

  it("works when customer_name is omitted (privacy mode)", async () => {
    const buf = await buildSpecSheetBuffer({
      project: { customer_name: null },
      requirements: mockRequirements,
      solution: mockSolution
    });
    assert.ok(buf instanceof Buffer);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /mnt/c/Users/Pitsanu/AI-presale-system
node --test test/unit/specsheet.test.js
```

Expected: `ERR_MODULE_NOT_FOUND` — `lib/specsheet.js` does not exist yet.

- [ ] **Step 3: Create `lib/specsheet.js`**

```js
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from "docx";

const BRAND_COLOR = "1A3A5C";
const ACCENT_COLOR = "0E7490";

function p(text, options = {}) {
  return new Paragraph({ children: [new TextRun({ text: String(text ?? ""), size: 20, font: "Calibri" })], spacing: { after: 100 }, ...options });
}

function h1(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 26, color: BRAND_COLOR, font: "Calibri" })],
    spacing: { before: 280, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT_COLOR, space: 4 } }
  });
}

function h2(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 22, color: BRAND_COLOR, font: "Calibri" })],
    spacing: { before: 200, after: 80 }
  });
}

function bullet(text) {
  return new Paragraph({
    children: [new TextRun({ text: `• ${text}`, size: 20, font: "Calibri" })],
    spacing: { after: 60 },
    indent: { left: 360 }
  });
}

function labeledRow(label, value) {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 35, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.CLEAR, color: "auto", fill: "F1F5F9" },
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 18, font: "Calibri", color: "475569" })], spacing: { after: 0 } })]
      }),
      new TableCell({
        width: { size: 65, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ children: [new TextRun({ text: String(value ?? "—"), size: 18, font: "Calibri" })], spacing: { after: 0 } })]
      })
    ]
  });
}

function twoColTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([label, value]) => labeledRow(label, value))
  });
}

function openForDistributorTable() {
  const headers = ["รายการ", "รายละเอียดจาก Distributor"];
  const fieldRows = [
    "Recommended SKUs",
    "List Price (ก่อนส่วนลด)",
    "Special / Project Price",
    "Delivery Lead Time",
    "หมายเหตุเพิ่มเติม"
  ];

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(text =>
      new TableCell({
        shading: { type: ShadingType.CLEAR, color: "auto", fill: BRAND_COLOR },
        children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 18, color: "FFFFFF", font: "Calibri" })], spacing: { after: 0 } })]
      })
    )
  });

  const dataRows = fieldRows.map(field =>
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: field, size: 18, font: "Calibri" })], spacing: { after: 0 } })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "________________________________", size: 18, color: "CBD5E1", font: "Calibri" })], spacing: { after: 0 } })] })
      ]
    })
  );

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...dataRows] });
}

export async function buildSpecSheetBuffer({ project, requirements, solution }) {
  const date = new Date().toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
  const selected = solution?.options?.[solution?.selected_option ?? 0] ?? {};
  const scale = requirements?.scale ?? {};
  const infra = requirements?.existing_infrastructure ?? {};

  const children = [
    new Paragraph({
      children: [new TextRun({ text: "Technical Specification Sheet", size: 48, bold: true, color: BRAND_COLOR, font: "Calibri" })],
      spacing: { after: 80 }
    }),
    new Paragraph({
      children: [new TextRun({ text: "สำหรับส่ง Authorized Distributor เพื่อขอใบเสนอราคาอย่างเป็นทางการ", size: 20, italics: true, color: "64748B", font: "Calibri" })],
      spacing: { after: 320 }
    }),

    h1("1. ข้อมูลโครงการ"),
    twoColTable([
      ["SI / บริษัท", "________________________________"],
      ["ลูกค้า (ถ้าเปิดเผยได้)", project?.customer_name ?? "ไม่ระบุ (Confidential)"],
      ["ประเภทโครงการ", requirements?.category ?? "—"],
      ["วันที่จัดทำ", date],
      ["Timeline ที่ต้องการ", requirements?.timeline ?? "—"]
    ]),

    h1("2. Workload Profile"),
    twoColTable([
      ["จำนวน VM (ปัจจุบัน)", scale.vm_count != null ? `${scale.vm_count} VMs` : "ไม่ระบุ"],
      ["จำนวน VM (3 ปีข้างหน้า)", scale.vm_count_3yr != null ? `${scale.vm_count_3yr} VMs` : "ไม่ระบุ"],
      ["Storage (Usable)", scale.storage_tb != null ? `${scale.storage_tb} TB` : "ไม่ระบุ"],
      ["จำนวน Users / Concurrent Sessions", scale.users != null ? `${scale.users} users` : "ไม่ระบุ"],
      ["งบประมาณโดยประมาณ", requirements?.budget_range ?? "ไม่ระบุ"]
    ]),

    h1("3. Architecture Requirements"),
    twoColTable([
      ["Solution ที่เลือก", selected.name ?? "—"],
      ["Architecture Type", selected.architecture ?? "—"],
      ["HA Level", selected.ha_level ?? "—"],
      ["DR Requirement (RPO/RTO)", selected.rpo_rto ?? "—"],
      ["Compliance / TOR Flags", (selected.compliance_flags ?? []).join(", ") || "ไม่มี"]
    ]),

    ...(infra.switches || infra.rack_power_kw || infra.fiber_available != null ? [
      h2("โครงสร้างพื้นฐานที่มีอยู่"),
      twoColTable([
        ["Network Switch", infra.switches ?? "ไม่ระบุ"],
        ["Rack Power (kW)", infra.rack_power_kw != null ? `${infra.rack_power_kw} kW` : "ไม่ระบุ"],
        ["Fiber Available", infra.fiber_available === true ? "Yes" : infra.fiber_available === false ? "No" : "ไม่ระบุ"],
        ["หมายเหตุ", infra.notes ?? "—"]
      ])
    ] : []),

    h1("4. Vendor & Product Family Preference"),
    twoColTable([
      ["Vendor Stack", (selected.vendor_stack ?? []).join(", ") || "—"],
      ["Product Family ที่แนะนำ", selected.name ?? "—"]
    ]),

    ...((requirements?.constraints ?? []).length > 0 ? [
      h2("ข้อจำกัด / Vendor Exclusions"),
      ...(requirements.constraints).map(c => bullet(c))
    ] : []),

    h1("5. สำหรับ Distributor — กรุณากรอก"),
    new Paragraph({
      children: [new TextRun({ text: "กรุณาระบุ SKU, ราคา และ lead time สำหรับ solution ข้างต้น", size: 18, italics: true, color: "64748B", font: "Calibri" })],
      spacing: { after: 120 }
    }),
    openForDistributorTable(),

    new Paragraph({ text: "", spacing: { before: 320 } }),
    new Paragraph({
      children: [new TextRun({ text: "CONFIDENTIAL — เอกสารนี้จัดทำโดย Franky-Presale สำหรับใช้ภายในและติดต่อ distributor เท่านั้น", size: 16, italics: true, color: "94A3B8", font: "Calibri" })],
      alignment: AlignmentType.CENTER
    })
  ];

  const doc = new Document({
    title: "Technical Specification Sheet",
    creator: "Franky-Presale",
    sections: [{
      properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [new TextRun({ text: `Technical Spec Sheet — ${date}`, size: 14, color: "94A3B8", font: "Calibri" })],
            alignment: AlignmentType.RIGHT,
            spacing: { after: 0 }
          })]
        })
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              new TextRun({ text: "Franky-Presale | Page ", size: 14, color: "94A3B8", font: "Calibri" }),
              new TextRun({ children: [PageNumber.CURRENT], size: 14, color: "94A3B8", font: "Calibri" }),
              new TextRun({ text: " / ", size: 14, color: "94A3B8", font: "Calibri" }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, color: "94A3B8", font: "Calibri" })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 0 }
          })]
        })
      },
      children
    }]
  });

  return Packer.toBuffer(doc);
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
node --test test/unit/specsheet.test.js
```

Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add lib/specsheet.js test/unit/specsheet.test.js
git commit -m "feat: add Technical Spec Sheet docx renderer"
```

---

## Task 2: Spec Sheet export endpoint in `server.js`

**Files:**
- Modify: `server.js` (add after the `export/solution` block, before the final `serveFile` call at line ~1050)

- [ ] **Step 1: Add the import at the top of server.js**

Find the existing import block at the top of `server.js`. Add after the `buildSolutionBuffer` import:

```js
import { buildSpecSheetBuffer } from "./lib/specsheet.js";
```

- [ ] **Step 2: Add the route handler**

In `server.js`, find this line:
```js
  return serveFile(response, path.join(__dirname, "error", "404.html"), "text/html; charset=utf-8");
```

Insert immediately before it:

```js
  if (request.method === "GET" && url.pathname.match(/^\/api\/projects\/[^/]+\/export\/spec$/)) {
    if (!requireUserAuth(request, response)) return;
    const projectId = url.pathname.split("/")[3];
    try {
      const project = await getProjectById(projectId);
      if (!project || !project.solution_json) {
        return json(response, 404, { ok: false, error: "Solution not found" });
      }
      const buffer = await buildSpecSheetBuffer({
        project,
        requirements: project.requirements_json,
        solution: project.solution_json
      });
      response.writeHead(200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${projectId}-spec-sheet.docx"`
      });
      response.end(buffer);
    } catch (error) {
      return json(response, 500, { ok: false, error: error.message });
    }
  }
```

- [ ] **Step 3: Run the full test suite to confirm nothing broke**

```bash
node --test
```

Expected: all existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat: add GET /api/projects/:id/export/spec endpoint"
```

---

## Task 3: Spec Sheet export button in chat UI

**Files:**
- Modify: `chat/chat.js` (inside `appendActionButtons` function)

- [ ] **Step 1: Add the export button**

In `chat/chat.js`, find:

```js
  const exportActions = [];
  if (stage === "bom") {
    exportActions.push(exportButton("Export BOM (.xlsx)", "bom", projectId));
    exportActions.push(exportButton("Export Solution (.docx)", "solution", projectId));
  } else if (stage === "complete") {
```

Replace with:

```js
  const exportActions = [];
  if (stage === "bom") {
    exportActions.push(exportButton("Export BOM (.xlsx)", "bom", projectId));
    exportActions.push(exportButton("Export Solution (.docx)", "solution", projectId));
    exportActions.push(exportButton("Export Spec Sheet for Distributor (.docx)", "spec", projectId));
  } else if (stage === "complete") {
```

And in the `complete` block, find:

```js
    exportActions.push(exportButton("Export BOM (.xlsx)", "bom", projectId));
    exportActions.push(exportButton("Export Solution (.docx)", "solution", projectId));
    exportActions.push(exportButton("Download Proposal (.docx)", "proposal", projectId));
```

Replace with:

```js
    exportActions.push(exportButton("Export BOM (.xlsx)", "bom", projectId));
    exportActions.push(exportButton("Export Solution (.docx)", "solution", projectId));
    exportActions.push(exportButton("Export Spec Sheet for Distributor (.docx)", "spec", projectId));
    exportActions.push(exportButton("Download Proposal (.docx)", "proposal", projectId));
```

- [ ] **Step 2: Wire the download handler**

In `chat/chat.js`, find the click handler block:

```js
      if (action === "bom") downloadBOM(projectIdDecoded, btn);
```

Add after it:

```js
      else if (action === "spec") downloadBinary(`/api/projects/${projectIdDecoded}/export/spec`, btn, `spec-sheet_${projectIdDecoded}.docx`, "กำลังโหลด Spec Sheet...");
```

- [ ] **Step 3: Verify in browser**

Start server: `node server.js`

Run a deal through to BOM stage. Confirm "Export Spec Sheet for Distributor (.docx)" button appears. Click it. Confirm .docx downloads with correct content.

- [ ] **Step 4: Commit**

```bash
git add chat/chat.js
git commit -m "feat: add Spec Sheet export button to chat UI"
```

---

## Task 4: "Why This Solution" narrative in proposal

**Files:**
- Modify: `agents/_prompts/proposal.md`
- Modify: `agents/proposal.js`
- Modify: `lib/proposal.js`

- [ ] **Step 1: Update the proposal prompt**

In `agents/_prompts/proposal.md`, after the `## next_steps` section, add:

```markdown
## why_section

Write a "ทำไมเราแนะนำ solution นี้" (Why We Recommend This Solution) section in formal Thai. This is inserted after the executive summary in the document.

- **problem_framing**: 2-3 sentences. State the customer's core need in plain Thai language that a non-technical decision-maker can understand.
- **why_architecture**: 3-4 bullet points. Why does this architecture type fit better than alternatives for this specific customer? Reference the customer's scale, budget, or operational constraints from the requirements.
- **trade_offs**: 2-3 sentences. Why the non-selected options were not chosen. Keep brief — one sentence per option.
- **risk_mitigations**: 2-3 sentences. What does this design account for that protects the customer?

Write entirely in Thai. Avoid generic statements — every sentence must reference something specific about the customer's situation.
```

- [ ] **Step 2: Add `why_section` to the JSON schema in `agents/proposal.js`**

In `agents/proposal.js`, find `proposalTextFormat`. Add `why_section` to both `properties` and `required`:

```js
      why_section: {
        type: "object",
        additionalProperties: false,
        properties: {
          problem_framing: { type: "string" },
          why_architecture: { type: "array", items: { type: "string" } },
          trade_offs: { type: "string" },
          risk_mitigations: { type: "string" }
        },
        required: ["problem_framing", "why_architecture", "trade_offs", "risk_mitigations"]
      }
```

Update `required` array in the schema to include `"why_section"`.

- [ ] **Step 3: Add `why_section` to sanitized object in `runProposalAgent`**

In `agents/proposal.js`, find the `sanitized` object:

```js
  const sanitized = {
    executive_summary: String(draft.executive_summary ?? "").trim(),
    ...
    next_steps: Array.isArray(draft.next_steps) ? draft.next_steps : []
  };
```

Add:

```js
    why_section: draft.why_section && typeof draft.why_section === "object" ? {
      problem_framing: String(draft.why_section.problem_framing ?? "").trim(),
      why_architecture: Array.isArray(draft.why_section.why_architecture) ? draft.why_section.why_architecture : [],
      trade_offs: String(draft.why_section.trade_offs ?? "").trim(),
      risk_mitigations: String(draft.why_section.risk_mitigations ?? "").trim()
    } : null,
```

- [ ] **Step 4: Pass `why_section` to `buildProposalBuffer`**

In `agents/proposal.js`, find the `buildProposalBuffer` call. Add:

```js
    whySection: sanitized.why_section,
```

- [ ] **Step 5: Render `why_section` in `lib/proposal.js`**

In `lib/proposal.js`, find the `buildProposalBuffer` function signature and add `whySection` as a parameter:

```js
export async function buildProposalBuffer({
  customerName,
  projectName,
  executiveSummary,
  whySection,        // ← add this
  solutionOverview,
  ...
```

In the `children` array, find the executive summary section:

```js
    h1("1. สรุปสำหรับผู้บริหาร"),
    p(executiveSummary, { spacing: { after: 160 } }),

    h1("2. แนวทางที่แนะนำ"),
```

Insert the why section between them:

```js
    h1("1. สรุปสำหรับผู้บริหาร"),
    p(executiveSummary, { spacing: { after: 160 } }),

    ...(whySection ? [
      h1("2. ทำไมเราแนะนำ Solution นี้"),
      p(whySection.problem_framing, { spacing: { after: 120 } }),
      ...(whySection.why_architecture?.length ? [
        h2("เหตุผลที่เลือก Architecture นี้"),
        ...whySection.why_architecture.map(point => bullet(point))
      ] : []),
      ...(whySection.trade_offs ? [
        h2("ทำไมไม่เลือก Option อื่น"),
        p(whySection.trade_offs, { spacing: { after: 120 } })
      ] : []),
      ...(whySection.risk_mitigations ? [
        h2("การรองรับความเสี่ยง"),
        p(whySection.risk_mitigations, { spacing: { after: 160 } })
      ] : [])
    ] : []),

    h1("3. แนวทางที่แนะนำ"),
```

Update all subsequent section numbers (`h1("2. ...")` → `h1("3. ...")`, etc.) to keep numbering consistent.

- [ ] **Step 6: Run tests**

```bash
node --test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add agents/_prompts/proposal.md agents/proposal.js lib/proposal.js
git commit -m "feat: add 'why this solution' section to proposal docx"
```

---

## Task 5: Guided Discovery hints — backend

**Files:**
- Modify: `agents/_prompts/discovery.md`
- Modify: `agents/discovery.js`

- [ ] **Step 1: Update discovery prompt to emit hints**

In `agents/_prompts/discovery.md`, find:

```
Return ONLY: `{ "question_text": "..." }`
```

Replace with:

```
Return ONLY: `{ "question_text": "...", "hints": [...] }`

hints is an array of objects — one per major topic covered in your questions. Each hint:
- "topic": short label in Thai (e.g. "จำนวน VM", "Storage", "งบประมาณ")
- "purpose": why the system is asking — one sentence in Thai (e.g. "ใช้สำหรับ sizing compute tier")
- "if_unsure": what the SI operator should do if they don't know the answer — one sentence in Thai (e.g. "ถามลูกค้าว่า 'มี server กี่ตัวที่ใช้งานอยู่?'")

Include a hint for every topic asked in question_text. Maximum 6 hints.
```

- [ ] **Step 2: Update `discoveryQuestionsFormat` schema in `agents/discovery.js`**

Find:

```js
const discoveryQuestionsFormat = {
  type: "json_schema",
  name: "discovery_questions_output",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      question_text: { type: "string" }
    },
    required: ["question_text"]
  }
};
```

Replace with:

```js
const discoveryQuestionsFormat = {
  type: "json_schema",
  name: "discovery_questions_output",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      question_text: { type: "string" },
      hints: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            topic: { type: "string" },
            purpose: { type: "string" },
            if_unsure: { type: "string" }
          },
          required: ["topic", "purpose", "if_unsure"]
        }
      }
    },
    required: ["question_text", "hints"]
  }
};
```

- [ ] **Step 3: Update mock response in `buildMockRequirements` for generate_questions mode**

In `agents/discovery.js`, find:

```js
    return {
      question_text: "สวัสดีครับ ผมเข้าใจว่าคุณต้องการระบบโครงสร้างพื้นฐานสำหรับองค์กร ช่วยบอกรายละเอียดเพิ่มเติมได้ไหมครับ เช่น มี VM อยู่ประมาณกี่ตัว storage รวมประมาณกี่ TB จำนวน user ทั้งหมด network switch ที่ใช้อยู่เป็น 10G หรือ 25G และงบประมาณคร่าวๆ ครับ"
    };
```

Replace with:

```js
    return {
      question_text: "สวัสดีครับ ผมเข้าใจว่าคุณต้องการระบบโครงสร้างพื้นฐานสำหรับองค์กร ช่วยบอกรายละเอียดเพิ่มเติมได้ไหมครับ เช่น มี VM อยู่ประมาณกี่ตัว storage รวมประมาณกี่ TB จำนวน user ทั้งหมด network switch ที่ใช้อยู่เป็น 10G หรือ 25G และงบประมาณคร่าวๆ ครับ",
      hints: [
        { topic: "จำนวน VM", purpose: "ใช้สำหรับ sizing compute tier (CPU/RAM)", if_unsure: "ถามลูกค้าว่า 'มี server กี่ตัวที่ต้องการย้ายมาเป็น VM?'" },
        { topic: "Storage (TB)", purpose: "ใช้สำหรับ sizing storage tier", if_unsure: "ประมาณจาก 2x ขนาดข้อมูลปัจจุบัน หรือถามลูกค้าว่า 'ข้อมูลทั้งหมดใช้พื้นที่ประมาณกี่ TB?'" },
        { topic: "จำนวน Users", purpose: "ใช้สำหรับ sizing licensing และ network throughput", if_unsure: "ใช้จำนวนพนักงานทั้งหมดหรือจำนวน PC ในองค์กร" },
        { topic: "งบประมาณ", purpose: "กำหนด tier ของ solution (entry/mid/enterprise)", if_unsure: "ถามลูกค้าว่า 'มีวงเงินคร่าวๆ สำหรับโครงการนี้ไหมครับ?'" }
      ]
    };
```

- [ ] **Step 4: Run discovery unit tests**

```bash
node --test test/unit/discovery.test.js
```

Expected: all existing tests pass. The `generate_questions` mode test checks `question_text` exists — still passes.

- [ ] **Step 5: Commit**

```bash
git add agents/_prompts/discovery.md agents/discovery.js
git commit -m "feat: add hints array to discovery questions for guided mode"
```

---

## Task 6: Guided Discovery hints — frontend rendering

**Files:**
- Modify: `chat/chat.js`
- Modify: `chat/chat.html`

- [ ] **Step 1: Add CSS for hint collapsible in `chat/chat.html`**

Find the `<style>` block in `chat/chat.html`. Add:

```css
.hint-toggle {
  display: inline-block;
  margin-top: 8px;
  font-size: 12px;
  color: #0E7490;
  cursor: pointer;
  user-select: none;
  background: none;
  border: none;
  padding: 0;
}
.hint-toggle:hover { text-decoration: underline; }
.hint-box {
  display: none;
  margin-top: 8px;
  padding: 10px 12px;
  background: #F0F7FF;
  border-left: 3px solid #0E7490;
  border-radius: 4px;
  font-size: 12px;
  color: #1E293B;
}
.hint-box.open { display: block; }
.hint-item { margin-bottom: 8px; }
.hint-item:last-child { margin-bottom: 0; }
.hint-topic { font-weight: 600; color: #1A3A5C; }
.hint-purpose { color: #475569; }
.hint-unsure { color: #0E7490; font-style: italic; }
```

- [ ] **Step 2: Update discovery question rendering in `chat/chat.js`**

In `chat/chat.js`, find the section that handles `payload.stage === "discovery_questions"` or where assistant bubble text is rendered for discovery questions. Look for `appendAssistantBubble`. Find the function:

```js
function appendAssistantBubble(markdown, stage) {
```

After this function, the question is appended. The discovery question payload returns `{ text, stage, hints }`. Find where `payload.text` is passed to `appendAssistantBubble`:

```js
    appendAssistantBubble(payload.text, payload.stage);
```

Replace with:

```js
    appendAssistantBubble(payload.text, payload.stage, payload.hints);
```

Update `appendAssistantBubble` signature and body to optionally render hints:

Find:
```js
function appendAssistantBubble(markdown, stage) {
```

Replace with:
```js
function appendAssistantBubble(markdown, stage, hints) {
```

Inside that function, after the bubble innerHTML is set, find where the bubble element is appended to thread. Before appending, add hint rendering after the bubble content is set:

```js
  if (hints && Array.isArray(hints) && hints.length > 0 && stage === "discovery_questions") {
    const hintToggle = document.createElement("button");
    hintToggle.className = "hint-toggle";
    hintToggle.textContent = "💡 ต้องการความช่วยเหลือในการตอบคำถาม?";

    const hintBox = document.createElement("div");
    hintBox.className = "hint-box";
    hintBox.innerHTML = hints.map(h => `
      <div class="hint-item">
        <div class="hint-topic">${escapeHtml(h.topic)}</div>
        <div class="hint-purpose">ทำไมถาม: ${escapeHtml(h.purpose)}</div>
        <div class="hint-unsure">ถ้าไม่แน่ใจ: ${escapeHtml(h.if_unsure)}</div>
      </div>
    `).join("");

    hintToggle.addEventListener("click", () => hintBox.classList.toggle("open"));
    bubble.appendChild(hintToggle);
    bubble.appendChild(hintBox);
  }
```

- [ ] **Step 3: Pass hints from chat API response**

In `lib/chat.js`, find where discovery questions are returned to the client. Look for the response that sets `stage: "discovery_questions"`. Add `hints: output.hints` (or `hints: []` if absent) to the response payload. The exact location depends on how chat.js formats the SSE `done` event — find the object that includes `text` and `stage` and add:

```js
hints: output?.hints ?? []
```

- [ ] **Step 4: Verify in browser**

Start server: `node server.js`

Open a new chat. Submit a brief. When discovery questions appear, verify "💡 ต้องการความช่วยเหลือ?" button appears below the question. Click it. Confirm hint box expands with topic, purpose, if_unsure entries.

- [ ] **Step 5: Commit**

```bash
git add chat/chat.html chat/chat.js lib/chat.js
git commit -m "feat: add collapsible hint box to discovery questions"
```

---

## Task 7: Deal Pipeline Dashboard

**Files:**
- Create: `pipeline/pipeline.html`
- Create: `pipeline/pipeline.js`
- Modify: `server.js` (serve `/pipeline` route)

- [ ] **Step 1: Create `pipeline/pipeline.html`**

```html
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Deal Pipeline — Franky-Presale</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Calibri", sans-serif; background: #F8FAFC; color: #1E293B; }
    header { background: #1A3A5C; color: #fff; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; }
    header h1 { font-size: 20px; font-weight: 700; }
    header a { color: #93C5FD; font-size: 14px; text-decoration: none; }
    header a:hover { text-decoration: underline; }
    .tabs { display: flex; gap: 0; border-bottom: 2px solid #E2E8F0; padding: 0 24px; background: #fff; }
    .tab { padding: 12px 20px; cursor: pointer; font-size: 14px; color: #64748B; border-bottom: 2px solid transparent; margin-bottom: -2px; }
    .tab.active { color: #1A3A5C; border-bottom-color: #0E7490; font-weight: 600; }
    .tab .count { background: #E2E8F0; border-radius: 10px; padding: 1px 7px; font-size: 12px; margin-left: 6px; }
    .tab.active .count { background: #0E7490; color: #fff; }
    .content { padding: 24px; max-width: 1000px; margin: 0 auto; }
    .deal-list { display: flex; flex-direction: column; gap: 12px; }
    .deal-card { background: #fff; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px 20px; display: flex; flex-direction: column; gap: 8px; }
    .deal-top { display: flex; justify-content: space-between; align-items: flex-start; }
    .deal-name { font-size: 16px; font-weight: 600; color: #1A3A5C; }
    .deal-meta { font-size: 13px; color: #64748B; margin-top: 2px; }
    .stage-badge { font-size: 12px; padding: 3px 10px; border-radius: 12px; font-weight: 600; }
    .stage-discovery { background: #FEF3C7; color: #92400E; }
    .stage-solution { background: #DBEAFE; color: #1E40AF; }
    .stage-bom { background: #D1FAE5; color: #065F46; }
    .stage-complete { background: #F3F4F6; color: #374151; }
    .deal-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .btn { font-size: 12px; padding: 5px 12px; border-radius: 6px; border: 1px solid #CBD5E1; background: #fff; cursor: pointer; color: #1E293B; }
    .btn:hover { background: #F1F5F9; }
    .btn-primary { background: #1A3A5C; color: #fff; border-color: #1A3A5C; }
    .btn-primary:hover { background: #0F2640; }
    .empty { text-align: center; padding: 48px; color: #94A3B8; font-size: 15px; }
    .new-btn { background: #0E7490; color: #fff; border: none; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; }
    .new-btn:hover { background: #0A5F75; }
    #error-msg { color: #DC2626; padding: 16px; text-align: center; }
  </style>
</head>
<body>
  <header>
    <h1>Deal Pipeline</h1>
    <div style="display:flex;gap:16px;align-items:center">
      <a href="/chat">+ New Deal</a>
      <a href="/chat">Chat</a>
    </div>
  </header>
  <div class="tabs" id="tabs"></div>
  <div class="content">
    <div id="error-msg" style="display:none"></div>
    <div class="deal-list" id="deal-list"></div>
  </div>
  <script src="/pipeline/pipeline.js" type="module"></script>
</body>
</html>
```

- [ ] **Step 2: Create `pipeline/pipeline.js`**

```js
const STAGE_LABELS = {
  discovery_complete: { label: "DISCOVERY", cssClass: "stage-discovery" },
  solution_complete: { label: "SOLUTION", cssClass: "stage-solution" },
  bom_complete: { label: "BOM", cssClass: "stage-bom" },
  proposal_complete: { label: "COMPLETE", cssClass: "stage-complete" }
};

const TAB_ORDER = ["ALL", "DISCOVERY", "SOLUTION", "BOM", "COMPLETE"];

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

function stageBadge(status) {
  const s = STAGE_LABELS[status] ?? { label: status ?? "—", cssClass: "stage-discovery" };
  return `<span class="stage-badge ${s.cssClass}">${s.label}</span>`;
}

function exportBtn(label, action, projectId) {
  return `<button class="btn" data-export="${action}" data-pid="${encodeURIComponent(projectId)}">${label}</button>`;
}

function dealCard(project) {
  const pid = project.id;
  const status = project.status ?? "";
  const category = project.requirements_json?.category ?? project.intake_json?.primary_use_case ?? "—";
  const date = formatDate(project.updated_at ?? project.created_at);

  const exports = [];
  if (["bom_complete", "proposal_complete"].includes(status)) {
    exports.push(exportBtn("Export BOM (.xlsx)", "bom", pid));
    exports.push(exportBtn("Export Spec Sheet (.docx)", "spec", pid));
  }
  if (["solution_complete", "bom_complete", "proposal_complete"].includes(status)) {
    exports.push(exportBtn("Export Solution (.docx)", "solution", pid));
  }
  if (status === "proposal_complete") {
    exports.push(exportBtn("Download Proposal (.docx)", "proposal", pid));
  }

  return `
    <div class="deal-card" data-stage="${STAGE_LABELS[status]?.label ?? "OTHER"}">
      <div class="deal-top">
        <div>
          <div class="deal-name">${project.customer_name ?? "ไม่ระบุชื่อลูกค้า"}</div>
          <div class="deal-meta">${category} · อัปเดต ${date}</div>
        </div>
        ${stageBadge(status)}
      </div>
      <div class="deal-actions">
        <button class="btn btn-primary" data-resume="${encodeURIComponent(pid)}">Resume</button>
        ${exports.join("")}
      </div>
    </div>
  `;
}

function renderTabs(projects, activeTab) {
  const counts = { ALL: projects.length, DISCOVERY: 0, SOLUTION: 0, BOM: 0, COMPLETE: 0 };
  projects.forEach(p => {
    const label = STAGE_LABELS[p.status]?.label;
    if (label && counts[label] !== undefined) counts[label]++;
  });

  return TAB_ORDER.map(tab => `
    <div class="tab ${tab === activeTab ? "active" : ""}" data-tab="${tab}">
      ${tab} <span class="count">${counts[tab]}</span>
    </div>
  `).join("");
}

let allProjects = [];
let activeTab = "ALL";

function filtered() {
  if (activeTab === "ALL") return allProjects;
  return allProjects.filter(p => (STAGE_LABELS[p.status]?.label ?? "OTHER") === activeTab);
}

function render() {
  document.getElementById("tabs").innerHTML = renderTabs(allProjects, activeTab);
  const list = document.getElementById("deal-list");
  const deals = filtered();
  list.innerHTML = deals.length === 0
    ? `<div class="empty">ไม่มี deal ใน ${activeTab}</div>`
    : deals.map(dealCard).join("");

  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => { activeTab = tab.dataset.tab; render(); });
  });

  document.querySelectorAll("[data-resume]").forEach(btn => {
    btn.addEventListener("click", () => {
      window.location.href = `/chat?project_id=${btn.dataset.resume}`;
    });
  });

  document.querySelectorAll("[data-export]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const pid = decodeURIComponent(btn.dataset.pid);
      const action = btn.dataset.export;
      const urlMap = {
        bom: `/api/projects/${pid}/export/bom`,
        spec: `/api/projects/${pid}/export/spec`,
        solution: `/api/projects/${pid}/export/solution`,
        proposal: `/api/projects/${pid}/export/proposal`
      };
      const url = urlMap[action];
      if (!url) return;
      btn.textContent = "กำลังโหลด...";
      btn.disabled = true;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(await res.text());
        const blob = await res.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${action}_${pid}.${action === "bom" ? "xlsx" : "docx"}`;
        a.click();
      } catch (e) {
        alert(`Export failed: ${e.message}`);
      } finally {
        btn.textContent = btn.dataset.export === "bom" ? "Export BOM (.xlsx)" : btn.dataset.export === "spec" ? "Export Spec Sheet (.docx)" : btn.dataset.export === "solution" ? "Export Solution (.docx)" : "Download Proposal (.docx)";
        btn.disabled = false;
      }
    });
  });
}

async function load() {
  try {
    const res = await fetch("/api/projects");
    if (res.status === 401) { window.location.replace("/login"); return; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    allProjects = Array.isArray(data) ? data : (data.projects ?? []);
    allProjects.sort((a, b) => new Date(b.updated_at ?? b.created_at) - new Date(a.updated_at ?? a.created_at));
    render();
  } catch (e) {
    document.getElementById("error-msg").style.display = "block";
    document.getElementById("error-msg").textContent = `ไม่สามารถโหลด projects: ${e.message}`;
  }
}

load();
```

- [ ] **Step 3: Add `/pipeline` route in `server.js`**

In `server.js`, find the section that serves static HTML files for routes like `/chat`, `/intake`. Look for the pattern that serves the chat page. Add `/pipeline` in the same style:

```js
  if (request.method === "GET" && url.pathname === "/pipeline") {
    if (!requireUserAuth(request, response)) return;
    return serveFile(response, path.join(__dirname, "pipeline", "pipeline.html"), "text/html; charset=utf-8");
  }

  if (request.method === "GET" && url.pathname === "/pipeline/pipeline.js") {
    return serveFile(response, path.join(__dirname, "pipeline", "pipeline.js"), "application/javascript; charset=utf-8");
  }
```

- [ ] **Step 4: Verify in browser**

Start server: `node server.js`

Navigate to `/pipeline`. Confirm deals are listed with correct stage badges. Click Resume on a deal — confirm redirects to `/chat?project_id=...`. Click Export Spec Sheet — confirm file downloads.

- [ ] **Step 5: Commit**

```bash
git add pipeline/pipeline.html pipeline/pipeline.js server.js
git commit -m "feat: add deal pipeline dashboard at /pipeline"
```

---

## Task 8: Final integration check

- [ ] **Run full test suite**

```bash
node --test
```

Expected: all tests pass.

- [ ] **Run smoke test**

```bash
AI_PRESALE_FORCE_LOCAL=1 node scripts/smoke.js
```

Expected: pipeline completes without errors.

- [ ] **Push to deploy**

```bash
git push origin master
```

---

## Self-Review Checklist

- [x] Spec coverage: Technical Spec Sheet (Tasks 1-3), Why Section (Task 4), Guided Discovery (Tasks 5-6), Pipeline Dashboard (Task 7)
- [x] No TBDs or placeholder steps — every step has actual code
- [x] Types consistent: `buildSpecSheetBuffer({ project, requirements, solution })` used in Task 1, Task 2, Task 7
- [x] `hints` array schema defined in Task 5, consumed in Task 6
- [x] `why_section` object shape defined in Task 4 step 2, passed in step 3, rendered in step 5
- [x] All section number renames in proposal.js (Task 4 step 5) noted explicitly
- [x] Pipeline export URLs in Task 7 include `/spec` route added in Task 2
