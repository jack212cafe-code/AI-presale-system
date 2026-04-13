import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { getProjectById, persistRequirementsJson, persistSolutionJson, persistBomJson } from '../lib/projects.js';
import { PdfExportEngine } from '../lib/pdf-export.js';
import { FinancialAnalystAgent } from '../lib/bom-export.js';
import { buildSolutionBuffer } from '../lib/solution-export.js';
import { buildSpecSheetBuffer } from '../lib/specsheet.js';
import { requireUserAuth, json } from './helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const pdfEngine = new PdfExportEngine();
const bomExcelAgent = new FinancialAnalystAgent();

export async function handle(request, url, response) {
  if (request.method !== "GET") return false;

  if (url.pathname.match(/^\/api\/proposals\/[^/]+\/download$/)) {
    if (!requireUserAuth(request, response)) return true;
    const projectId = url.pathname.split("/")[3];
    try {
      const project = await getProjectById(projectId);
      if (!project || !project.proposal_url) {
        return json(response, 404, { ok: false, error: "Proposal not found" }), true;
      }
      const filePath = path.resolve(ROOT, project.proposal_url);
      const file = await readFile(filePath);
      const filename = path.basename(filePath);
      response.writeHead(200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`
      });
      response.end(file);
    } catch (error) {
      json(response, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (url.pathname.match(/^\/api\/projects\/[^/]+\/export\/pdf$/)) {
    if (!requireUserAuth(request, response)) return true;
    const projectId = url.pathname.split("/")[3];
    const type = url.searchParams.get("type") || "proposal";
    try {
      const project = await getProjectById(projectId);
      if (!project) return json(response, 404, { ok: false, error: "Project not found" }), true;

      let pdfBuffer;
      if (type === "bom") {
        const bom = await persistBomJson(projectId, {});
        pdfBuffer = await pdfEngine.generateBomPdf(bom, projectId);
      } else {
        const requirements = await persistRequirementsJson(projectId, {});
        const solution = await persistSolutionJson(projectId, {});
        const bom = await persistBomJson(projectId, {});

        const proposalData = {
          customerName: project.customer_name,
          projectName: `${project.customer_name} Presale Proposal`,
          executiveSummary: "Loading...",
          solutionOverview: "Loading...",
          bomRows: bom.rows || [],
          assumptions: [],
          nextSteps: []
        };
        pdfBuffer = await pdfEngine.generateProposalPdf(proposalData);
      }

      response.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${projectId}-export.pdf"`
      });
      response.end(pdfBuffer);
    } catch (error) {
      json(response, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (url.pathname.match(/^\/api\/projects\/[^/]+\/export\/bom$/)) {
    if (!requireUserAuth(request, response)) return true;
    const projectId = url.pathname.split("/")[3];
    try {
      const project = await getProjectById(projectId);
      if (!project || !project.bom_json?.rows?.length) {
        return json(response, 404, { ok: false, error: "BOM not found" }), true;
      }

      const buffer = await bomExcelAgent.generateBOMBuffer(project.bom_json, projectId);
      response.writeHead(200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${projectId}-bom.xlsx"`
      });
      response.end(buffer);
    } catch (error) {
      json(response, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (url.pathname.match(/^\/api\/projects\/[^/]+\/export\/solution$/)) {
    if (!requireUserAuth(request, response)) return true;
    const projectId = url.pathname.split("/")[3];
    try {
      const project = await getProjectById(projectId);
      if (!project || !project.solution_json) {
        return json(response, 404, { ok: false, error: "Solution not found" }), true;
      }

      const buffer = await buildSolutionBuffer({
        project,
        requirements: project.requirements_json,
        solution: project.solution_json,
        bomRows: project.bom_json?.rows ?? []
      });

      response.writeHead(200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${projectId}-solution.docx"`
      });
      response.end(buffer);
    } catch (error) {
      console.error("[export:solution]", error);
      json(response, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (url.pathname.match(/^\/api\/projects\/[^/]+\/export\/spec$/)) {
    if (!requireUserAuth(request, response)) return true;
    const projectId = url.pathname.split("/")[3];
    try {
      const project = await getProjectById(projectId);
      if (!project || !project.solution_json) {
        return json(response, 404, { ok: false, error: "Solution not found" }), true;
      }
      const buffer = await buildSpecSheetBuffer({
        project,
        requirements: project.requirements_json,
        solution: project.solution_json
      });
      response.writeHead(200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${projectId}-spec-sheet.docx"`
      });
      response.end(buffer);
    } catch (error) {
      console.error("[export:spec]", error);
      json(response, 500, { ok: false, error: error.message });
    }
    return true;
  }

  return false;
}
