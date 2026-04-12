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
  const selected = solution?.options?.[solution?.selected_option ?? 0] ?? solution?.options?.[0] ?? {};
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
