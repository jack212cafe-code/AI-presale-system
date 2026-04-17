import { normalizeIntakePayload } from '../lib/intake.js';
import {
  createProjectRecord,
  getProjectById,
  persistRequirementsJson,
  persistSolutionJson,
  persistSpecialistBriefs,
  persistBomJson,
  approveProject
} from '../lib/projects.js';
import { runDiscoveryAgent } from '../agents/discovery.js';
import { runSolutionAgent } from '../agents/solution.js';
import { runAllSpecialists } from '../agents/specialist.js';
import { runBomAgent } from '../agents/bom.js';
import { runProposalAgent } from '../agents/proposal.js';
import { checkBudgetOverrun } from '../lib/budget.js';
import { validateHciComputeDrives, validateBackupServer, validateSwitchAddition } from '../lib/sizing-validator.js';
import { handleChatMessage } from '../lib/chat.js';
import { requireUserAuth, json, parseBody } from './helpers.js';
import { getSessionUserId, getSessionUser } from '../lib/user-auth.js';
import { requireRateLimit } from '../lib/rate-limit.js';
import { config } from '../lib/config.js';

export async function handle(request, url, response) {
  if (request.method === "POST" && url.pathname === "/api/pipeline") {
    if (!requireUserAuth(request, response)) return true;
    const user = getSessionUser(request);
    if (!requireRateLimit(request, response, user.userId, "pipeline")) return true;
    let projectId = null;
    let project = null;
    let stageFailed = null;

    try {
      const rawPayload = await parseBody(request);
      const intake = normalizeIntakePayload(rawPayload);
      const created = await createProjectRecord(intake, user.userId, user.orgId);
      project = created.project;
      projectId = project.id;

      stageFailed = "discovery";
      const requirements = await runDiscoveryAgent(intake, { projectId });
      const discoveryResult = await persistRequirementsJson(projectId, requirements);
      project = discoveryResult.project ?? project;

      stageFailed = "solution";
      const specialistBriefs = await runAllSpecialists(requirements, { projectId });
      await persistSpecialistBriefs(projectId, specialistBriefs);
      const solution = await runSolutionAgent(requirements, { projectId, specialistBriefs });
      await persistSolutionJson(projectId, solution);

      stageFailed = "bom";
      const bom = await runBomAgent(solution, { projectId, specialistBriefs, requirements });
      await persistBomJson(projectId, bom);

      const selectedOpt = solution.options?.[solution.selected_option ?? 0];
      const budgetWarning = checkBudgetOverrun(selectedOpt?.estimated_tco_thb, requirements.budget_range);

      const resolvedTopology = selectedOpt?.topology ?? null;
      const hciDriveChecks = validateHciComputeDrives(bom.rows ?? [], resolvedTopology);
      const backupServerChecks = validateBackupServer(bom.rows ?? [], selectedOpt);
      const switchChecks = validateSwitchAddition(bom.rows ?? [], requirements?.existing_infrastructure);
      const bomWarnings = [
        ...hciDriveChecks.warnings,
        ...backupServerChecks.warnings,
        ...switchChecks.warnings
      ];

      await approveProject(projectId);

      stageFailed = "proposal";
      const proposalResult = await runProposalAgent(intake, requirements, solution, bom, { projectId, budgetWarning });

      const finalProject = await getProjectById(projectId);

      json(response, 201, {
        ok: true,
        project: finalProject ?? project,
        pipeline_stages: {
          discovery: "complete",
          solution: "complete",
          bom: "complete",
          proposal: "complete"
        },
        bom_warnings: bomWarnings.length ? bomWarnings : null
      });
    } catch (error) {
      const partialProject = projectId ? await getProjectById(projectId).catch(() => project) : project;
      json(response, 500, {
        ok: false,
        stage_failed: stageFailed,
        error: error.message,
        project: partialProject
      });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/chat") {
    if (!requireUserAuth(request, response)) return true;
    const user = getSessionUser(request);
    if (!requireRateLimit(request, response, user.userId, "pipeline")) return true;
    try {
      const payload = await parseBody(request);
      if (!payload.message || typeof payload.message !== "string" || !payload.message.trim()) {
        return json(response, 400, { ok: false, error: "message is required" }), true;
      }
      if (payload.project_id) {
        const { getUserMonthlyCost } = await import('../lib/db/agents.js');
        const monthlyCost = await getUserMonthlyCost(user.userId);
        const monthlyBudget = config.openai.userMonthlyBudget ?? 15;
        if (monthlyCost >= monthlyBudget) {
          return json(response, 429, {
            ok: false,
            error: "You have reached your monthly usage limit."
          }), true;
        }
      }
      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
      });

      const sendEvent = (data) => {
        response.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      let lastProgressAt = Date.now();
      const onProgress = (step, total, label) => {
        lastProgressAt = Date.now();
        sendEvent({ type: "progress", step, total, label });
      };

      const heartbeat = setInterval(() => {
        if (Date.now() - lastProgressAt > 15000) {
          response.write(": heartbeat\n\n");
        }
      }, 20000);

      let result;
      try {
        result = await handleChatMessage({
          conversationId: payload.conversation_id || null,
          message: payload.message,
          userId: user.userId,
          orgId: user.orgId,
          onProgress
        });
      } catch (chatError) {
        console.error("[chat] pipeline error:", chatError);
        sendEvent({ type: "done", ok: false, error: chatError.message });
        response.end();
        clearInterval(heartbeat);
        return true;
      }
      clearInterval(heartbeat);

      if (result.ok === false || result.stage === "error") {
        console.error("[chat] returning error result:", result);
        sendEvent({ type: "done", ok: false, error: result.text, conversation_id: result.conversation_id, project_id: result.project_id, stage: result.stage });
      } else {
        sendEvent({ type: "done", ok: true, conversation_id: result.conversation_id, project_id: result.project_id, stage: result.stage, text: result.text, created: result.created, grounding_warnings: result.grounding_warnings ?? 0, diagram_mermaid: result.diagram_mermaid || null, diagram_explanation: result.diagram_explanation || null });
      }
      response.end();
    } catch (error) {
      console.error("[chat] unexpected error:", error);
      try { response.write(`data: ${JSON.stringify({ type: "done", ok: false, error: error.message })}\n\n`); response.end(); } catch {}
    }
    return true;
  }

  return false;
}
