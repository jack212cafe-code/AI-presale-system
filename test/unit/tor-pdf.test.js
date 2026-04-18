import { test } from "node:test";
import assert from "node:assert/strict";

const { generateTorCompliancePdf } = await import("../../lib/pdf-export.js");

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
        }
      ],
      overall_status: "comply_with_review",
      compliance_statement_th: "ผ่าน",
      presale_review_notes: ["ตรวจสอบ RAM เพิ่มเติม"],
      kb_coverage: "full"
    }]
  };
}

test("generateTorCompliancePdf returns a valid PDF buffer", { timeout: 60000 }, async () => {
  const buf = await generateTorCompliancePdf(sampleReport());
  assert.ok(Buffer.isBuffer(buf) || buf instanceof Uint8Array);
  const head = Buffer.from(buf).slice(0, 4).toString();
  assert.equal(head, "%PDF");
  assert.ok(buf.length > 1000, `PDF suspiciously small: ${buf.length} bytes`);
});

test("generateTorCompliancePdf escapes HTML in user content", { timeout: 60000 }, async () => {
  const report = {
    project_name: "<script>alert(1)</script>",
    items: [{
      item_no: "1", category: "X", quantity: 1, recommended_model: "M", model_spec_summary: "s",
      compliance_checks: [{
        spec_label: "<b>x</b>", tor_requirement: "", product_value: "",
        status: "review", note: "", evidence_quote: "", evidence_source_file: ""
      }],
      overall_status: "review", compliance_statement_th: "", presale_review_notes: [], kb_coverage: "partial"
    }]
  };
  const buf = await generateTorCompliancePdf(report);
  assert.equal(Buffer.from(buf).slice(0, 4).toString(), "%PDF");
});

test("generateTorCompliancePdf handles empty items array", { timeout: 60000 }, async () => {
  const buf = await generateTorCompliancePdf({ project_name: "Empty", items: [] });
  assert.equal(Buffer.from(buf).slice(0, 4).toString(), "%PDF");
});
