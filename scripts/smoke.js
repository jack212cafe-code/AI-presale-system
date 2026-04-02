import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const useMock = args.includes("--mock");
const fixtureArg = args.find((item) => item !== "--mock");

if (useMock) {
  process.env.AI_PRESALE_FORCE_LOCAL = "1";
}

const { runDiscoveryAgent } = await import("../agents/discovery.js");
const { runSolutionAgent } = await import("../agents/solution.js");
const { runBomAgent } = await import("../agents/bom.js");
const { runProposalAgent } = await import("../agents/proposal.js");
const { normalizeIntakePayload } = await import("../lib/intake.js");

const fixturePath = fixtureArg
  ? path.resolve(fixtureArg)
  : path.join(projectRoot, "test", "fixtures", "scenario_hci.json");

const intake = normalizeIntakePayload(JSON.parse(await readFile(fixturePath, "utf8")));
const requirements = await runDiscoveryAgent(intake);
const solution = await runSolutionAgent(requirements);
const bom = await runBomAgent(solution);
const project = {
  customer_name: intake.customer_name
};
const proposal = await runProposalAgent(project, requirements, solution, bom);

const outputDir = path.join(projectRoot, "output");
await mkdir(outputDir, { recursive: true });

const summaryPath = path.join(outputDir, `${intake.customer_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-summary.json`);
await writeFile(
  summaryPath,
  JSON.stringify({ intake, requirements, solution, bom, proposal }, null, 2),
  "utf8"
);

console.log(
  JSON.stringify(
    {
      ok: true,
      fixture: fixturePath,
      summary_path: summaryPath,
      proposal_path: proposal.proposal_path
    },
    null,
    2
  )
);
