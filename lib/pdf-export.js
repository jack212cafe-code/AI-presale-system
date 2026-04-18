import puppeteer from 'puppeteer';
import handlebars from 'handlebars';
import path from 'node:path';
import fs from 'node:fs/promises';

export class PdfExportEngine {
  constructor() {
    this.brandColor = '1A3A5C';
    this.accentColor = '0E7490';
    this.altRowBg = 'F8FAFC';
  }

  async generateProposalPdf(data) {
    const templateSource = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Sarabun', 'Calibri', sans-serif; color: #334155; line-height: 1.6; margin: 0; padding: 0; }
        .page { padding: 2cm; page-break-after: always; }
        .cover { height: 100vh; display: flex; flex-direction: column; justify-content: center; text-align: center; }
        .brand { color: #94A3B8; font-weight: bold; font-size: 18px; margin-bottom: 20px; }
        .title { color: {{brandColor}}; font-size: 48px; font-weight: bold; margin-bottom: 40px; }
        .customer { font-size: 22px; color: #475569; margin-bottom: 10px; }
        .date { font-size: 22px; color: #475569; margin-bottom: 40px; }
        .status-tag { color: #DC2626; font-style: italic; font-size: 20px; }

        h1 { color: {{brandColor}}; border-bottom: 4px solid {{accentColor}}; padding-bottom: 10px; margin-top: 40px; font-size: 28px; }
        h2 { color: {{brandColor}}; font-size: 22px; margin-top: 20px; }
        p { margin-bottom: 15px; font-size: 18px; text-align: justify; }
        .bullet-list { margin-bottom: 20px; }
        .bullet-item { margin-bottom: 8px; font-size: 18px; padding-left: 20px; position: relative; }
        .bullet-item::before { content: '•'; position: absolute; left: 0; color: {{accentColor}}; }

        table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 16px; }
        th { background-color: {{brandColor}}; color: white; text-align: left; padding: 12px; border: 1px solid #ddd; }
        td { padding: 10px; border: 1px solid #ddd; vertical-align: top; }
        .alt-row { background-color: {{altRowBg}}; }

        .footer { position: fixed; bottom: 20px; width: 100%; text-align: center; font-size: 14px; color: #94A3B8; }
        .confidential { text-align: center; color: #94A3B8; font-size: 16px; margin-top: 50px; font-weight: bold; }

        .sign-table { width: 100%; margin-top: 40px; }
        .sign-table td { height: 60px; }
      </style>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">
    </head>
    <body>
      <div class="page cover">
        <div class="brand">Franky-Presale</div>
        <div class="title">{{projectName}}</div>
        <div class="customer"><strong>ลูกค้า:</strong> {{customerName}}</div>
        <div class="date"><strong>วันที่:</strong> {{date}}</div>
        <div class="status-tag">สถานะ: รอการอนุมัติจาก presale engineer ก่อนส่งลูกค้า</div>
      </div>

      <div class="page">
        <h1>1. สรุปสำหรับผู้บริหาร</h1>
        <p>{{executiveSummary}}</p>

        <h1>2. แนวทางที่แนะนำ</h1>
        <p>{{solutionOverview}}</p>

        {{#if solutionArchitecture}}
          <h2>สถาปัตยกรรมระบบ</h2>
          <p>{{solutionArchitecture}}</p>
        {{/if}}

        {{#if solutionVendors}}
          <h2>ผลิตภัณฑ์ที่เลือกใช้</h2>
          <div class="bullet-list">
            {{#each solutionVendors}}
              <div class="bullet-item">{{this}}</div>
            {{/each}}
          </div>
        {{/if}}
      </div>

      <div class="page">
        <h1>3. รายการอุปกรณ์ (Bill of Materials)</h1>
        <p style="font-style: italic; color: #475569; font-size: 16px;">
          หมายเหตุ: เอกสารนี้ไม่รวมราคา กรุณาส่ง BOM ให้ authorized distributor เพื่อขอใบเสนอราคาอย่างเป็นทางการ
        </p>
        <table>
          <thead>
            <tr>
              <th>ประเภท</th>
              <th>รายละเอียด / Specification</th>
              <th>จำนวน</th>
              <th>หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {{#each bomRows}}
              <tr class="{{#if @index}} {{#if (isEven @index)}}alt-row{{/if}} {{/if}}">
                <td>{{category}}</td>
                <td>{{description}}</td>
                <td style="text-align: center;">{{qty}}</td>
                <td>{{notes}}</td>
              </tr>
            {{/each}}
          </tbody>
        </table>
      </div>

      <div class="page">
        <h1>4. ข้อสมมติฐานและข้อจำกัด</h1>
        <div class="bullet-list">
          {{#each assumptions}}
            <div class="bullet-item">{{this}}</div>
          {{/each}}
        </div>

        <h1>5. ขั้นตอนถัดไป</h1>
        <div class="bullet-list">
          {{#each nextSteps}}
            <div class="bullet-item">{{this}}</div>
          {{/each}}
        </div>

        <div class="confidential">CONFIDENTIAL — เอกสารนี้จัดทำเพื่อใช้ภายในองค์กรเท่านั้น</div>

        <h1 style="margin-top: 60px;">6. การตรวจสอบและอนุมัติ</h1>
        <p>เอกสารนี้ต้องได้รับการตรวจสอบจาก presale engineer ก่อนส่งให้ลูกค้า</p>
        <table class="sign-table">
          <tr style="background-color: #F1F5F9; font-weight: bold;">
            <td>บทบาท</td>
            <td>ชื่อ-นามสกุล</td>
            <td>วันที่ / ลายเซ็น</td>
          </tr>
          <tr>
            <td>Presale Engineer</td>
            <td>____________________</td>
            <td>____________________</td>
          </tr>
          <tr>
            <td>Sales Manager</td>
            <td>____________________</td>
            <td>____________________</td>
          </tr>
        </table>
      </div>
    </body>
    </html>
    `;

    const template = handlebars.compile(templateSource);
    const html = template({
      ...data,
      brandColor: this.brandColor,
      accentColor: this.accentColor,
      altRowBg: this.altRowBg,
      date: new Date().toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })
    });

    const browser = await puppeteer.launch({
      headless: "shell",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '2cm', right: '2cm', bottom: '2cm', left: '2cm' }
      });
      return pdfBuffer;
    } finally {
      await browser.close();
    }
  }

  async generateTorCompliancePdf(report) {
    return generateTorCompliancePdf(report);
  }

  async generateBomPdf(bomData, projectId) {
    // ใช้โครงสร้างที่คล้ายกับ Proposal แต่เน้นตาราง BOM
    const data = {
      projectName: `BOM - ${projectId}`,
      customerName: "Project ID: " + projectId,
      bomRows: bomData.rows || [],
      brandColor: this.brandColor,
      accentColor: this.accentColor,
      altRowBg: this.altRowBg
    };

    // สำหรับ BOM PDF อาจจะใช้ template ย่อยที่เน้นตารางอย่างเดียว (เพื่อความรวดเร็วจะใช้ Logic เดียวกับ Proposal แต่ตัดส่วนอื่นออก)
    // ในเวอร์ชันสมบูรณ์ควรแยก Template ไฟล์
    return this.generateProposalPdf({
      ...data,
      executiveSummary: "รายการอุปกรณ์ (Bill of Materials) สำหรับโครงการ",
      solutionOverview: "รายละเอียดรายการ Hardware และ Software ที่แนะนำ",
      assumptions: ["ราคาเป็นเพียงการประมาณการ", "กรุณาตรวจสอบความถูกต้องกับ Distributor"],
      nextSteps: ["ยืนยัน Sizing", "ขอใบเสนอราคาทางการ"]
    });
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

export async function generateTorCompliancePdf(report) {
  const statusFill = {
    comply: "#D9F2E6",
    not_comply: "#F9D7D7",
    review: "#FFF1C2"
  };

  const itemsHtml = (report.items || []).map(item => `
    <h2>Item ${escapeHtml(item.item_no)} — ${escapeHtml(item.category)} × ${item.quantity || 0}</h2>
    <p><strong>Recommended:</strong> ${escapeHtml(item.recommended_model || "—")}</p>
    <p><em>${escapeHtml(item.model_spec_summary || "")}</em></p>
    <table>
      <thead>
        <tr>
          <th>Spec</th><th>Requirement</th><th>Product value</th>
          <th>Status</th><th>Evidence quote</th><th>Source</th>
        </tr>
      </thead>
      <tbody>
        ${(item.compliance_checks || []).map(c => `
          <tr>
            <td>${escapeHtml(c.spec_label)}</td>
            <td>${escapeHtml(c.tor_requirement)}</td>
            <td>${escapeHtml(c.product_value)}</td>
            <td style="background:${statusFill[c.status] || "transparent"}">${escapeHtml(c.status)}</td>
            <td>${escapeHtml(c.evidence_quote || "—")}</td>
            <td>${escapeHtml(c.evidence_source_file || "—")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    ${(item.presale_review_notes || []).length > 0 ? `
      <p><strong>Presale review notes:</strong></p>
      <ul>${item.presale_review_notes.map(n => `<li>${escapeHtml(n)}</li>`).join("")}</ul>
    ` : ""}
  `).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { font-family: 'Sarabun', 'Calibri', sans-serif; color: #334155; padding: 2cm; }
    h1 { color: #1A3A5C; border-bottom: 3px solid #0E7490; padding-bottom: 6px; }
    h2 { color: #1A3A5C; margin-top: 24px; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12px; }
    th { background: #1A3A5C; color: white; padding: 8px; text-align: left; }
    td { padding: 6px; border: 1px solid #ddd; vertical-align: top; }
    .footer { margin-top: 40px; font-size: 11px; color: #64748B; }
  </style><link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet"></head>
  <body>
    <h1>TOR Compliance Report — ${escapeHtml(report.project_name || "")}</h1>
    <p>Generated: ${new Date().toISOString()}</p>
    ${itemsHtml}
    <p class="footer">Generated by Franky-Presale — ทุกรายการต้องได้รับการตรวจสอบโดย presale engineer ก่อนส่งลูกค้า</p>
  </body></html>`;

  const browser = await puppeteer.launch({
    headless: "shell",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "2cm", right: "2cm", bottom: "2cm", left: "2cm" }
    });
  } finally {
    await browser.close();
  }
}
