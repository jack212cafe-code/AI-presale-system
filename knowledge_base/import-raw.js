import "dotenv/config";

import { importRawDocuments } from "./raw-import-lib.js";

function readNumberArg(argv, flag, fallback) {
  const index = argv.indexOf(flag);
  if (index === -1 || index + 1 >= argv.length) {
    return fallback;
  }

  const value = Number(argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const result = await importRawDocuments({
  validateOnly: process.argv.includes("--validate-only"),
  chunkSize: readNumberArg(process.argv, "--chunk-size", 1600),
  chunkOverlap: readNumberArg(process.argv, "--chunk-overlap", 200)
});

console.log(JSON.stringify(result, null, 2));
