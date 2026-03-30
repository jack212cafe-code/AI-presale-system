import { createConversation, getConversationById, updateConversationStage, addMessage } from "./conversations.js";
import { createProjectRecord, getProjectById, persistRequirementsJson, persistSolutionJson, persistBomJson, approveProject } from "./projects.js";
import { normalizeIntakePayload } from "./intake.js";
import { runDiscoveryAgent } from "../agents/discovery.js";
import { runSolutionAgent } from "../agents/solution.js";
import { runBomAgent } from "../agents/bom.js";
import { runProposalAgent } from "../agents/proposal.js";

function formatSolutionOptions(solution) {
  const options = Array.isArray(solution) ? solution : (solution?.options ?? []);
  if (options.length === 0) {
    return "## Solution Options\n\nNo options generated.";
  }

  const lines = ["## Solution Options\n"];
  options.forEach((opt, i) => {
    const name = opt.name ?? opt.title ?? `Option ${i + 1}`;
    const desc = opt.description ?? opt.summary ?? "";
    lines.push(`${i + 1}. **${name}**${desc ? ` - ${desc}` : ""}`);
    if (opt.components && Array.isArray(opt.components)) {
      opt.components.slice(0, 3).forEach((c) => {
        lines.push(`   - ${typeof c === "string" ? c : (c.name ?? JSON.stringify(c))}`);
      });
    }
  });
  lines.push("\nPlease reply with the number of the option you'd like to proceed with.");
  return lines.join("\n");
}

function formatBomAndProposal(bom, project) {
  const items = Array.isArray(bom) ? bom : (bom?.items ?? bom?.line_items ?? []);
  const lines = ["## Bill of Materials\n", "| Item | Qty | Unit Price (THB) | Total (THB) |", "| --- | --- | --- | --- |"];

  if (items.length > 0) {
    items.forEach((item) => {
      const name = item.name ?? item.description ?? item.product ?? "Unknown";
      const qty = item.quantity ?? item.qty ?? 1;
      const unit = item.unit_price ?? item.price ?? 0;
      const total = item.total ?? item.total_price ?? (qty * unit);
      lines.push(`| ${name} | ${qty} | ${Number(unit).toLocaleString()} | ${Number(total).toLocaleString()} |`);
    });
  } else {
    lines.push("| — | — | — | — |");
  }

  lines.push("");

  if (project?.proposal_url) {
    lines.push(`## Proposal Ready\n\nYour proposal document is available at: \`${project.proposal_url}\``);
  } else {
    lines.push("## Proposal Generated\n\nYour proposal has been generated and saved. Please check with your administrator for the document.");
  }

  return lines.join("\n");
}

async function handleGreeting({ message, userId }) {
  const intake = normalizeIntakePayload({
    customer_name: "Chat Project",
    primary_use_case: message,
    notes: message
  });

  const created = await createProjectRecord(intake, userId);
  const projectId = created.project.id;

  const conv = await createConversation(projectId, userId);
  const conversationId = conv.conversation.id;

  await addMessage(conversationId, "user", message);

  const requirements = await runDiscoveryAgent(intake, { projectId });
  await persistRequirementsJson(projectId, requirements);

  const solution = await runSolutionAgent(requirements, { projectId });
  await persistSolutionJson(projectId, solution);

  await updateConversationStage(conversationId, "awaiting_selection");

  const responseText = formatSolutionOptions(solution);
  await addMessage(conversationId, "assistant", responseText);

  return {
    conversation_id: conversationId,
    project_id: projectId,
    stage: "awaiting_selection",
    text: responseText,
    created: true
  };
}

async function handleAwaitingSelection({ conversation, conversationId, message }) {
  await addMessage(conversationId, "user", message);

  const match = message.match(/(\d+)/);
  let selectedIndex = match ? parseInt(match[1], 10) : 1;

  const project = await getProjectById(conversation.project_id);
  const solution = project?.solution_json;
  const options = Array.isArray(solution) ? solution : (solution?.options ?? []);
  const maxIndex = Math.max(options.length, 1);
  selectedIndex = Math.max(1, Math.min(selectedIndex, maxIndex));

  const selectedOption = options[selectedIndex - 1] ?? solution;

  const bom = await runBomAgent(selectedOption, {
    projectId: conversation.project_id,
    requirements: project.requirements_json
  });
  await persistBomJson(conversation.project_id, bom);

  await updateConversationStage(conversationId, "bom");

  await approveProject(conversation.project_id);

  await runProposalAgent(
    project.intake_json,
    project.requirements_json,
    selectedOption,
    bom,
    { projectId: conversation.project_id }
  );

  await updateConversationStage(conversationId, "complete");

  const finalProject = await getProjectById(conversation.project_id);
  const responseText = formatBomAndProposal(bom, finalProject);
  await addMessage(conversationId, "assistant", responseText);

  return {
    conversation_id: conversationId,
    project_id: conversation.project_id,
    stage: "complete",
    text: responseText,
    created: false
  };
}

export async function handleChatMessage({ conversationId, message, userId }) {
  if (!conversationId) {
    try {
      return await handleGreeting({ message, userId });
    } catch (error) {
      return {
        conversation_id: conversationId ?? null,
        project_id: null,
        stage: "greeting",
        text: `Sorry, an error occurred during discovery: ${error.message}. Please try again.`,
        created: false
      };
    }
  }

  const conversation = await getConversationById(conversationId);
  if (!conversation) {
    return {
      conversation_id: conversationId,
      project_id: null,
      stage: "error",
      text: "Conversation not found. Please start a new conversation.",
      created: false
    };
  }

  const stage = conversation.stage;

  if (stage === "complete") {
    return {
      conversation_id: conversationId,
      project_id: conversation.project_id,
      stage: "complete",
      text: "Your proposal is already ready. Please start a new conversation to begin a new project.",
      created: false
    };
  }

  if (stage === "awaiting_selection") {
    try {
      return await handleAwaitingSelection({ conversation, conversationId, message });
    } catch (error) {
      await addMessage(conversationId, "assistant", `Sorry, an error occurred during selection: ${error.message}. Please try again.`).catch(() => {});
      return {
        conversation_id: conversationId,
        project_id: conversation.project_id,
        stage,
        text: `Sorry, an error occurred during selection: ${error.message}. Please try again.`,
        created: false
      };
    }
  }

  return {
    conversation_id: conversationId,
    project_id: conversation.project_id,
    stage,
    text: `An error occurred: unexpected stage "${stage}". Please start a new conversation.`,
    created: false
  };
}
