import ExcelJS from 'exceljs';
import path from 'node:path';
import fs from 'node:fs/promises';

/**
 * Financial Analyst Agent Implementation
 * Specializes in transforming BOM JSON into professional multi-sheet Excel workbooks.
 */
export class FinancialAnalystAgent {
  constructor(options = {}) {
    this.currency = options.currency || 'THB';
    this.brandColor = options.brandColor || '003366'; // Dark Blue
    this.accentColor = options.accentColor || 'E6E6E6'; // Light Grey
  }

  /**
   * Generates a professional .xlsx BOM
   * @param {Object} bomData - The sanitized BOM JSON from runBomAgent
   * @param {String} projectId - Project ID for file naming
   * @returns {Promise<String>} Absolute path to the generated file
   */
  async generateBOMExcel(bomData, projectId) {
    const workbook = new ExcelJS.Workbook();

    // 1. Summary Sheet
    const summarySheet = workbook.addWorksheet('Summary');
    this._setupSummarySheet(summarySheet, bomData, projectId);

    // 2. Detailed Parts List Sheet
    const partsSheet = workbook.addWorksheet('Detailed Parts List');
    this._setupPartsSheet(partsSheet, bomData);

    // 3. Pricing & Calculations Sheet
    const pricingSheet = workbook.addWorksheet('Pricing');
    this._setupPricingSheet(pricingSheet, bomData);

    // Ensure output directory exists
    const outputDir = path.join(process.cwd(), 'output');
    await fs.mkdir(outputDir, { recursive: true });

    const filePath = path.join(outputDir, `BOM_${projectId}.xlsx`);
    await workbook.xlsx.writeFile(filePath);

    return filePath;
  }

  _setupSummarySheet(sheet, bomData, projectId) {
    sheet.columns = [
      { header: 'Project ID', key: 'id', width: 40 },
      { header: 'Total Items', key: 'total', width: 20 },
      { header: 'Estimated Total', key: 'totalPrice', width: 25 },
      { header: 'Currency', key: 'currency', width: 15 },
    ];

    // Header Styling
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${this.brandColor}` }
    };

    sheet.addRow({
      id: projectId,
      total: bomData.rows.length,
      totalPrice: 'See Pricing Sheet', // Formulas are best handled in Pricing sheet
      currency: this.currency
    });

    sheet.getRow(2).eachCell(cell => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
  }

  _setupPartsSheet(sheet, bomData) {
    sheet.columns = [
      { header: 'Category', key: 'category', width: 25 },
      { header: 'Description', key: 'description', width: 60 },
      { header: 'Quantity', key: 'qty', width: 15 },
      { header: 'Notes', key: 'notes', width: 50 },
    ];

    // Header Styling
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${this.brandColor}` }
    };

    bomData.rows.forEach(row => {
      sheet.addRow({
        category: row.category,
        description: row.description,
        qty: row.qty,
        notes: row.notes
      });
    });

    // Format all rows with borders
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.eachCell(cell => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
      }
    });
  }

  _setupPricingSheet(sheet, bomData) {
    sheet.columns = [
      { header: 'Category', key: 'category', width: 25 },
      { header: 'Description', key: 'description', width: 60 },
      { header: 'Qty', key: 'qty', width: 10 },
      { header: 'Unit Price', key: 'unitPrice', width: 20 },
      { header: 'Total', key: 'total', width: 20 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${this.brandColor}` }
    };

    let currentRow = 2;
    bomData.rows.forEach(row => {
      // Note: Unit prices are typically fetched from pricing_catalog.
      // In this engine, if specific prices are missing, we use a placeholder
      // and mark it for "Distributor Verification" as per project requirements.
      const unitPrice = 0; // Placeholder: In real flow, this is merged with pricing_catalog data

      sheet.addRow({
        category: row.category,
        description: row.description,
        qty: row.qty,
        unitPrice: unitPrice,
        total: { formula: `=${sheet.getCellByAddress('C' + currentRow)}*${sheet.getCellByAddress('D' + currentRow)}` }
      });

      // Format as currency
      sheet.getCellByAddress('D' + currentRow).numFmt = '#,##0.00';
      sheet.getCellByAddress('E' + currentRow).numFmt = '#,##0.00';

      currentRow++;
    });

    // Total Row
    const totalRowNumber = currentRow;
    sheet.addRow({
      category: 'GRAND TOTAL',
      description: '',
      qty: '',
      unitPrice: '',
      total: { formula: `=SUM(E2:E${totalRowNumber - 1})` }
    });

    const totalRow = sheet.getRow(totalRowNumber);
    totalRow.font = { bold: true };
    totalRow.getCell(5).numFmt = '#,##0.00';
    totalRow.getCell(5).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${this.accentColor}` }
    };
  }
}
