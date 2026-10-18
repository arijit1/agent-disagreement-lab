#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import dotenv from "dotenv";
import { ZodError } from "zod";

import { runRefundCase } from "../application/runRefundCase.js";
import { runInformationViewPair } from "../application/runInformationViewPair.js";
import { listScenarios, getScenario } from "../../fixtures/scenarios.js";
import { exportExperimentResults } from "../infrastructure/experimentExporter.js";
import { writeExperimentReport } from "../infrastructure/experimentReport.js";
import { writeArticleAgentHandoff } from "../infrastructure/articleAgentHandoff.js";
import { createJsonlAuditRepository } from "../infrastructure/jsonlAuditRepository.js";
import { createMockProvider } from "../providers/mockProvider.js";
import { createOpenAIProvider } from "../providers/openaiProvider.js";
import { ProviderError } from "../providers/providerError.js";
import { parseCliArgs, USAGE } from "./parseArgs.js";
import { renderTrace } from "./renderTrace.js";

function defaultProviderFactory({ scenario, config }) {
  return config.mode === "mock"
    ? createMockProvider(scenario)
    : createOpenAIProvider(config.openai);
}

function publicError(error) {
  if (error instanceof RangeError || error instanceof TypeError || error instanceof ProviderError) return error.message;
  if (error instanceof ZodError) return "Validated input or output did not match the required schema.";
  return "Operation failed; no result was recorded.";
}

export async function runCli({
  args = process.argv.slice(2),
  env = process.env,
  stdout = process.stdout,
  providerFactory = defaultProviderFactory,
  idGenerator,
} = {}) {
  const { help, config } = parseCliArgs({ args, env });
  if (help) {
    stdout.write(USAGE);
    return [];
  }
  const scenarios = config.scenarioId
    ? [getScenario(config.scenarioId)]
    : config.suite
      ? listScenarios({ suite: config.suite })
      : listScenarios().filter((scenario) => scenario.cohort !== "information-view");
  const auditRepository = createJsonlAuditRepository({ outputPath: config.auditOutputPath });
  const records = [];

  for (let repeatIndex = 1; repeatIndex <= config.runs; repeatIndex += 1) {
    for (const scenario of scenarios) {
      if (config.suite === "information-view") {
        const pairId = `pair-${scenario.id}-${repeatIndex}-${randomUUID()}`;
        const pair = await runInformationViewPair({
          scenario,
          providerFactory: ({ arm }) => providerFactory({ scenario, config, arm }),
          mode: config.mode,
          repeatIndex,
          pairId,
          ...(idGenerator ? { idGenerator } : {}),
        });
        for (const record of pair.records) {
          await auditRepository.append(record);
          records.push(record);
          stdout.write(`${renderTrace(record)}\n`);
        }
      } else {
        const provider = providerFactory({ scenario, config });
        const record = await runRefundCase({ scenario, provider, mode: config.mode, repeatIndex, ...(idGenerator ? { idGenerator } : {}) });
        await auditRepository.append(record);
        records.push(record);
        stdout.write(`${renderTrace(record)}\n`);
      }
    }
  }

  await exportExperimentResults({ records, outputPath: config.resultsOutputPath, format: config.resultsFormat });
  await writeExperimentReport({ records, outputPath: config.reportOutputPath });
  if (config.suite === "information-view") {
    let historicalReport = null;
    try { historicalReport = JSON.parse(await readFile("outputs/live-challenge-report.json", "utf8")); } catch {}
    await writeArticleAgentHandoff({
      records,
      historicalReport,
      markdownPath: config.handoffMarkdownPath,
      jsonPath: config.handoffJsonPath,
    });
  }
  stdout.write(`\nAudit JSONL: ${config.auditOutputPath}\nExperiment ${config.resultsFormat.toUpperCase()}: ${config.resultsOutputPath}\nConsolidated report: ${config.reportOutputPath}\n${config.suite === "information-view" ? `Article handoff: ${config.handoffMarkdownPath} and ${config.handoffJsonPath}\n` : ""}`);
  return records;
}

export async function main(options = {}) {
  const stderr = options.stderr ?? process.stderr;
  try {
    await runCli(options);
    return 0;
  } catch (error) {
    stderr.write(`Error: ${publicError(error)}\n`);
    return 1;
  }
}

const isDirectInvocation = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectInvocation) {
  dotenv.config({ quiet: true });
  process.exitCode = await main();
}
