import { loadConfig } from "../infrastructure/config.js";

export const USAGE = `Usage:
  npm run demo
  npm run demo -- --scenario S2
  npm run demo -- --mode live --scenario S2
  npm run demo -- --mode live --scenario S2 --runs 5
  npm run demo -- --mode live --suite disagreement --runs 5
  npm run demo -- --mode live --suite information-view --runs 3
  npm run demo -- --results outputs/results.csv --format csv

Options:
  --mode mock|live       Execution mode (default: mock)
  --scenario S1..S20     Run one scenario (default: all baseline and disagreement scenarios)
  --suite NAME           Run disagreement or paired information-view scenarios
  --runs N               Repeat each selected scenario N times
  --output PATH          Append JSONL audit records
  --results PATH         Write experiment results
  --report PATH          Write consolidated JSON report
  --handoff-md PATH      Write article-agent Markdown handoff (information-view)
  --handoff-json PATH    Write article-agent JSON handoff (information-view)
  --format json|csv      Experiment result format
  --help                 Show this help
`;

export function parseCliArgs({ args, env }) {
  if (args.includes("--help")) {
    if (args.length !== 1) throw new RangeError("--help cannot be combined with other options");
    return { help: true, config: null };
  }
  return { help: false, config: loadConfig({ args, env }) };
}
