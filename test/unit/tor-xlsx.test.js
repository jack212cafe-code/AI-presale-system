import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

const { generateTorComplianceXlsx } = await import("../../lib/tor-export.js");

function sampleReport() {
  return {
    project_name: "Test Project",
    tor_id: "t1",
    items: [{
      item_no: "1",
      category: "Server",
      quantity: 2,
      recommended_model: "Dell R760",
      model_spec_summary: "Xeon 2.1GHz 64GB",
      compliance_checks: [
        {
          spec_label: "CPU",
          tor_requirement: ">=2.0 GHz",
          product_value: "2.1 GHz",
          status: "comply",
          note: "",
          evidence_quote: "Intel Xeon 2.1 GHz",
          evidence_source_file: "r760.pdf"
        },
        {
          spec_label: "RAM",
          tor_requirement: ">=64 GB",
          product_value: "32 GB",
          status: "not_comply",
          note: "RAM ต่ำกว่าข้อกำหนด",
          evidence_quote: "Memory: 32GB DDR5",
          evidence_source_file: "r760.pdf"
        },
        {
          spec_label: "PSU",
          tor_requirement: "Redundant 800W",
          product_value: "น่าจะมี PSU redundant",
          status: "review",
          note: "ต้องตรวจสอบเพิ่มเติม",
          evidence_quote: "",
          evidence_source_file: ""
        }
      ],
      overall_status: "comply_with_review",
      compliance_statement_th: "ผ่าน",
      presale_review_notes: [],
      kb_coverage: "full"
    }]
  };
}

test("generateTorComplianceXlsx returns a valid xlsx buffer (PK magic)", async () => {
  const buf = await generateTorComplianceXlsx(sampleReport());
  assert.ok(Buffer.isBuffer(buf));
  assert.equal(buf.slice(0, 2).toString(), "PK");
});

test("generateTorComplianceXlsx writes one row per compliance_check with correct columns", async () => {
  const buf = await generateTorComplianceXlsx(sampleReport());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  assert.equal(ws.rowCount, 4);
  const header = ws.getRow(1).values.slice(1);
  assert.deepEqual(header, [
    "Item", "Category", "Product", "Spec", "Requirement",
    "Product value", "Status", "Evidence quote", "Source", "Note"
  ]);
  const row2 = ws.getRow(2).values.slice(1);
  assert.equal(row2[3], "CPU");
  assert.equal(row2[6], "comply");
  assert.equal(row2[7], "Intel Xeon 2.1 GHz");
  assert.equal(row2[8], "r760.pdf");
});

test("generateTorComplianceXlsx applies status fill colors (green/red/amber)", async () => {
  const buf = await generateTorComplianceXlsx(sampleReport());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  const colors = [2, 3, 4].map(i => ws.getRow(i).getCell(7).fill?.fgColor?.argb);
  assert.equal(colors[0], "FFD9F2E6");
  assert.equal(colors[1], "FFF9D7D7");
  assert.equal(colors[2], "FFFFF1C2");
});

test("generateTorComplianceXlsx header row is bold", async () => {
  const buf = await generateTorComplianceXlsx(sampleReport());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  assert.equal(ws.getRow(1).font?.bold, true);
});

test("generateTorComplianceXlsx handles empty items array", async () => {
  const buf = await generateTorComplianceXlsx({ project_name: "Empty", items: [] });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  assert.equal(ws.rowCount, 1);
});
