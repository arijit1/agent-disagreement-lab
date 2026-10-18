import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { decisionRecordSchema, experimentResultSchema } from "../domain/schemas.js";

const columns = [
  "scenarioId",
  "expectedPolicyVerdict",
  "provenance",
  "runId",
  "repeatIndex",
  "experiment",
  "agentResponses",
  "conflict",
  "evaluation",
  "arbitratorResult",
  "verificationOutcome",
  "finalDisposition",
  "override",
  "latencyMs",
  "tokenUsage",
];

function toExperimentResult(input) {
  const record = decisionRecordSchema.parse(input);
  return experimentResultSchema.parse({
    scenarioId: record.scenarioId,
    expectedPolicyVerdict: record.expectedPolicyVerdict,
    provenance: record.provenance,
    runId: record.runId,
    repeatIndex: record.repeatIndex,
    experiment: record.experiment ?? null,
    agentResponses: record.agentResults,
    conflict: record.conflict,
    evaluation: record.evaluation,
    arbitratorResult: record.arbitratorResult,
    verificationOutcome: record.policyVerdict,
    finalDisposition: record.finalDisposition,
    override: record.override,
    latencyMs: record.timing.totalMs,
    tokenUsage: record.usage,
  });
}

function csvValue(value) {
  const text = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows) {
  return `${columns.join(",")}\n${rows.map((row) => columns.map((column) => csvValue(row[column])).join(",")).join("\n")}\n`;
}

export async function exportExperimentResults({ records, outputPath, format }) {
  if (!new Set(["json", "csv"]).has(format)) throw new RangeError(`Unsupported results format: ${format}`);
  const rows = records.map(toExperimentResult);
  const provenances = new Set(rows.map((row) => row.provenance));
  if (provenances.size > 1) throw new Error("Experiment export cannot mix mock and live provenance");
  await mkdir(dirname(outputPath), { recursive: true });
  const content = format === "json" ? `${JSON.stringify(rows, null, 2)}\n` : toCsv(rows);
  await writeFile(outputPath, content, { encoding: "utf8", mode: 0o600 });
  return rows;
}
