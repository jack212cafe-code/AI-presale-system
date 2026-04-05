import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from "docx";


function paragraph(text, options = {}) {
  return new Paragraph({
    text,
    spacing: { after: 160 },
    ...options
  });
}

function heading(text, level) {
  return new Paragraph({
    text,
    heading: level,
    spacing: { before: 240, after: 120 }
  });
}

export async function buildProposalBuffer({
  customerName,
  projectName,
  executiveSummary,
  solutionOverview,
  bomRows,
  assumptions
}) {
  const colWidths = [15, 55, 10, 20];
  const headerRow = new TableRow({
    children: ["Category", "Description / Specification", "Qty", "Notes"].map(
      (text, i) =>
        new TableCell({
          width: { size: colWidths[i], type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })]
        })
    )
  });

  const lineRows = bomRows.map(
    (row) =>
      new TableRow({
        children: [
          row.category ?? "",
          row.description ?? "",
          String(row.qty ?? 1),
          row.notes ?? ""
        ].map(
          (text) =>
            new TableCell({
              children: [new Paragraph(String(text))]
            })
        )
      })
  );

  const document = new Document({
    sections: [
      {
        children: [
          heading(projectName, HeadingLevel.TITLE),
          paragraph(`Customer: ${customerName}`),
          heading("Executive Summary", HeadingLevel.HEADING_1),
          paragraph(executiveSummary),
          heading("Recommended Solution", HeadingLevel.HEADING_1),
          paragraph(solutionOverview),
          heading("Bill of Materials", HeadingLevel.HEADING_1),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [headerRow, ...lineRows]
          }),
          heading("Assumptions", HeadingLevel.HEADING_1),
          ...assumptions.map((item) => paragraph(item))
        ]
      }
    ]
  });

  return Packer.toBuffer(document);
}

