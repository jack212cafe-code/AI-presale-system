import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
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
const HEADER_BG = "F0F7FF";
const ALT_ROW_BG = "F8FAFC";

function p(text, options = {}) {
  return new Paragraph({ text, spacing: { after: 120 }, ...options });
}

function h1(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 28, color: BRAND_COLOR, font: "Calibri" })],
    spacing: { before: 320, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT_COLOR, space: 4 } }
  });
}

function h2(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 22, color: BRAND_COLOR, font: "Calibri" })],
    spacing: { before: 240, after: 80 }
  });
}

function bullet(text) {
  return new Paragraph({
    children: [new TextRun({ text: `• ${text}`, size: 20, font: "Calibri" })],
    spacing: { after: 60 },
    indent: { left: 360 }
  });
}

function divider() {
  return new Paragraph({
    text: "",
    spacing: { after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0", space: 2 } }
  });
}

function coverBlock(customerName, projectName, date) {
  return [
    new Paragraph({
      children: [new TextRun({ text: "AI PRESALE SYSTEM", size: 18, color: "94A3B8", font: "Calibri", bold: true, allCaps: true })],
      spacing: { after: 80 }
    }),
    new Paragraph({
      children: [new TextRun({ text: projectName, size: 52, bold: true, color: BRAND_COLOR, font: "Calibri" })],
      spacing: { after: 160 }
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "ลูกค้า: ", bold: true, size: 22, font: "Calibri", color: "475569" }),
        new TextRun({ text: customerName, size: 22, font: "Calibri", color: "475569" })
      ],
      spacing: { after: 60 }
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "วันที่: ", bold: true, size: 22, font: "Calibri", color: "475569" }),
        new TextRun({ text: date, size: 22, font: "Calibri", color: "475569" })
      ],
      spacing: { after: 60 }
    }),
    new Paragraph({
      children: [new TextRun({ text: "สถานะ: รอการอนุมัติจาก presale engineer ก่อนส่งลูกค้า", size: 20, font: "Calibri", color: "DC2626", italics: true })],
      spacing: { after: 480 }
    }),
    divider()
  ];
}

function bomTable(rows) {
  const colWidths = [14, 52, 8, 26];
  const headers = ["ประเภท", "รายละเอียด / Specification", "จำนวน", "หมายเหตุ"];

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((text, i) =>
      new TableCell({
        width: { size: colWidths[i], type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.CLEAR, color: "auto", fill: BRAND_COLOR },
        children: [
          new Paragraph({
            children: [new TextRun({ text, bold: true, size: 18, color: "FFFFFF", font: "Calibri" })],
            spacing: { after: 0 }
          })
        ]
      })
    )
  });

  const dataRows = rows.map((row, idx) =>
    new TableRow({
      children: [
        row.category ?? "",
        row.description ?? "",
        String(row.qty ?? 1),
        row.notes ?? ""
      ].map((text, ci) =>
        new TableCell({
          width: { size: colWidths[ci], type: WidthType.PERCENTAGE },
          shading: idx % 2 === 0 ? undefined : { type: ShadingType.CLEAR, color: "auto", fill: ALT_ROW_BG },
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: String(text),
                  size: ci === 2 ? 20 : 18,
                  font: "Calibri",
                  bold: ci === 2
                })
              ],
              alignment: ci === 2 ? AlignmentType.CENTER : AlignmentType.LEFT,
              spacing: { after: 0 }
            })
          ]
        })
      )
    })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows]
  });
}

export async function buildProposalBuffer({
  customerName,
  projectName,
  executiveSummary,
  solutionOverview,
  bomRows,
  assumptions,
  nextSteps,
  solutionArchitecture,
  solutionVendors
}) {
  const date = new Date().toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });

  const children = [
    ...coverBlock(customerName, projectName || `${customerName} — ใบเสนอแนวทาง Presale`, date),

    h1("1. สรุปสำหรับผู้บริหาร"),
    p(executiveSummary, { spacing: { after: 160 } }),

    h1("2. แนวทางที่แนะนำ"),
    p(solutionOverview, { spacing: { after: 120 } }),

    ...(solutionArchitecture ? [
      h2("สถาปัตยกรรมระบบ"),
      p(solutionArchitecture, { spacing: { after: 120 } })
    ] : []),

    ...(solutionVendors?.length ? [
      h2("ผลิตภัณฑ์ที่เลือกใช้"),
      ...solutionVendors.map(v => bullet(v))
    ] : []),

    h1("3. รายการอุปกรณ์ (Bill of Materials)"),
    new Paragraph({
      children: [new TextRun({
        text: "หมายเหตุ: เอกสารนี้ไม่รวมราคา กรุณาส่ง BOM ให้ authorized distributor เพื่อขอใบเสนอราคาอย่างเป็นทางการ",
        size: 18, italics: true, color: "475569", font: "Calibri"
      })],
      spacing: { after: 120 }
    }),
    bomTable(bomRows),

    h1("4. ข้อสมมติฐานและข้อจำกัด"),
    ...assumptions.map(a => bullet(a)),

    h1("5. ขั้นตอนถัดไป"),
    ...(nextSteps?.length
      ? nextSteps.map(s => bullet(s))
      : [
          bullet("ส่ง BOM ให้ authorized distributor เพื่อขอใบเสนอราคาอย่างเป็นทางการ"),
          bullet("นัด workshop กับลูกค้าเพื่อยืนยัน sizing และ requirements ก่อน finalize"),
          bullet("Presale engineer ตรวจสอบและ approve เอกสารก่อนส่งให้ลูกค้า"),
          bullet("กำหนด timeline การติดตั้งและ milestone การ���่งมอบ")
        ]
    ),

    divider(),
    new Paragraph({
      children: [
        new TextRun({ text: "เอกสารนี้สร้างโดย AI Presale System · ยังไม่ผ่านการอนุมัติจาก presale engineer", size: 16, italics: true, color: "94A3B8", font: "Calibri" })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 0 }
    })
  ];

  const document = new Document({
    sections: [{
      properties: {
        page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } }
      },
      children
    }]
  });

  return Packer.toBuffer(document);
}
