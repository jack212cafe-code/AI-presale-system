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

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0
});

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
  const headerRow = new TableRow({
    children: ["Part Number", "Description", "Qty", "Unit Price", "Total Price"].map(
      (text) =>
        new TableCell({
          width: { size: 20, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })]
        })
    )
  });

  const lineRows = bomRows.map(
    (row) =>
      new TableRow({
        children: [
          row.part_number,
          row.description,
          String(row.qty),
          money.format(row.unit_price),
          money.format(row.total_price)
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

