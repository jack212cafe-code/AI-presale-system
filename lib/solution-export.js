import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from "docx";

function heading(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 28 })],
    spacing: { before: 200, after: 120 }
  });
}

function bullet(text) {
  return new Paragraph({
    children: [new TextRun({ text: `• ${text}`, size: 20 })],
    spacing: { after: 60 },
    indent: { left: 300 }
  });
}

function kvTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([left, right]) => new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: left, bold: true })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun(String(right ?? ""))] })] })
      ]
    }))
  });
}

export async function buildSolutionBuffer({ project, requirements, solution, bomRows = [] }) {
  const selected = solution?.options?.[solution.selected_option ?? 0] ?? solution?.options?.[0] ?? {};
  const options = Array.isArray(solution?.options) ? solution.options : [];

  const children = [
    heading("Solution Summary"),
    kvTable([
      ["Customer", project?.customer_name ?? ""],
      ["Project", `${project?.customer_name ?? "Project"} Presale Solution`],
      ["Category", requirements?.category ?? ""],
      ["Selected Architecture", selected.architecture ?? ""],
      ["Selected Vendors", (selected.vendor_stack ?? []).join(", ")],
      ["Retrieval Mode", solution?.retrieval_mode ?? ""]
    ]),
    heading("Recommended Option"),
    bullet(selected.name ? `${selected.name}: ${selected.architecture ?? ""}` : (selected.architecture ?? "Recommended architecture")),
    ...(Array.isArray(selected.rationale) ? selected.rationale.slice(0, 6).map(bullet) : []),
    heading("Options Considered"),
    ...options.map((opt, index) => bullet(`${index + 1}. ${opt.name ?? `Option ${index + 1}`} - ${(opt.vendor_stack ?? []).join(", ")}`)),
    heading("Key Assumptions"),
    ...((requirements?.assumptions_applied ?? []).length ? requirements.assumptions_applied.map(bullet) : [
      bullet("Sizing and licensing remain subject to final distributor quote and customer workshop confirmation."),
      bullet("Any model number not explicitly verified in the KB must be confirmed with the distributor.")
    ]),
    heading("Risks"),
    ...((selected.risks ?? []).length ? selected.risks.map(bullet) : [bullet("Vendor pricing and availability should be revalidated at quote time.")]),
    heading("Bill of Materials Snapshot"),
    kvTable([
      ["BOM Rows", String(bomRows.length)],
      ["Primary Storage", String(requirements?.scale?.storage_tb ?? "")],
      ["VM Count", String(requirements?.scale?.vm_count ?? "")],
      ["Backup Requirement", String(requirements?.trust_requirements?.join(", ") ?? "")] 
    ]),
    heading("Next Steps"),
    bullet("Validate BOM line items and exact SKUs with the distributor."),
    bullet("Confirm final licensing, support, and delivery scope."),
    bullet("Approve the proposal package for customer presentation.")
  ];

  const document = new Document({
    sections: [
      {
        children
      }
    ]
  });

  return Buffer.from(await Packer.toBuffer(document));
}
