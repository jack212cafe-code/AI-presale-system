// Excel-compatible CSV export for TOR compliance report
// Thai government bids require UTF-8 BOM for Excel to read Thai correctly

const STATUS_LABEL = {
  pass: "ผ่าน ✓",
  review: "ตรวจสอบ ⚠",
  fail: "ไม่ผ่าน ✗",
  comply: "ผ่านทุกข้อ",
  comply_with_review: "ผ่าน (มีรายการต้องตรวจสอบ)",
  non_comply: "ไม่ผ่าน",
  kb_insufficient: "KB ไม่เพียงพอ"
};

function escapeCsv(value) {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

function row(...cells) {
  return cells.map(escapeCsv).join(",") + "\r\n";
}

export function generateTorComplianceCsv(report) {
  const { project_name, items } = report;
  const now = new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });

  let csv = "\uFEFF"; // UTF-8 BOM — required for Thai in Excel

  // Header section
  csv += row("รายงานการตรวจสอบคุณลักษณะเฉพาะ (TOR Compliance Report)");
  csv += row(`โครงการ: ${project_name}`);
  csv += row(`วันที่ออกรายงาน: ${now}`);
  csv += row("หมายเหตุ: รายงานนี้จัดทำโดยระบบ AI — กรุณาให้ฝ่าย Presale ตรวจสอบรายการที่มีเครื่องหมาย ⚠ ก่อนยื่น bid");
  csv += "\r\n";

  // Compliance matrix
  csv += row(
    "ลำดับ", "รายการ", "จำนวน", "หน่วย",
    "รุ่นที่แนะนำ", "Spec สินค้า",
    "คุณสมบัติ TOR", "ข้อกำหนด TOR", "ค่าสินค้า", "ผลตรวจสอบ", "หมายเหตุ",
    "สถานะรายการ", "รายการที่ต้องตรวจสอบ"
  );

  for (const item of items) {
    const statusLabel = STATUS_LABEL[item.overall_status] ?? item.overall_status;
    const reviewNotes = (item.presale_review_notes ?? []).join(" | ");
    const checks = item.compliance_checks ?? [];

    if (checks.length === 0) {
      csv += row(
        item.item_no, item.category, item.quantity, "ชุด",
        item.recommended_model, item.model_spec_summary,
        "", "", "", "", "",
        statusLabel, reviewNotes
      );
    } else {
      checks.forEach((check, idx) => {
        csv += row(
          idx === 0 ? item.item_no : "",
          idx === 0 ? item.category : "",
          idx === 0 ? item.quantity : "",
          idx === 0 ? "ชุด" : "",
          idx === 0 ? item.recommended_model : "",
          idx === 0 ? item.model_spec_summary : "",
          check.spec_label,
          check.tor_requirement,
          check.product_value,
          STATUS_LABEL[check.status] ?? check.status,
          check.note,
          idx === 0 ? statusLabel : "",
          idx === 0 ? reviewNotes : ""
        );
      });
    }
    csv += "\r\n";
  }

  // Compliance statements section
  csv += "\r\n";
  csv += row("=== คำรับรองคุณลักษณะ (Compliance Statements) — สำหรับแนบเอกสาร bid ===");
  csv += "\r\n";
  for (const item of items) {
    csv += row(`รายการที่ ${item.item_no}: ${item.category} (${item.quantity} ชุด)`);
    csv += row(item.compliance_statement_th);
    csv += "\r\n";
  }

  return csv;
}

export function getTorExportFilename(projectName) {
  const date = new Date().toISOString().slice(0, 10);
  const safe = (projectName ?? "TOR").replace(/[^a-zA-Z0-9ก-ฮ\s-]/g, "").slice(0, 40).trim();
  return `TOR-Compliance-${safe}-${date}.csv`;
}
