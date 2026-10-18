import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { analyzeInformationViewPairs } from "../domain/analyzeInformationViewPairs.js";
import { compareDisagreementStrategies } from "../domain/compareDisagreementStrategies.js";
import { decisionRecordSchema } from "../domain/schemas.js";

const ratio = (numerator, denominator) => denominator === 0 ? null : numerator / denominator;

export function evaluateFiveRepeatGate(pairAnalysis, inputs) {
  const records = inputs.map((record) => decisionRecordSchema.parse(record));
  const decisionRecords = records.filter((record) => record.conflict.type === "decision_mismatch" && !record.evaluation.classifications.includes("operational_failure"));
  const scenarios = new Set(decisionRecords.map((record) => record.scenarioId));
  const validPairs = pairAnalysis.filter((pair) => pair.attribution !== "unclassifiable_operational_failure").length;
  const validRate = ratio(validPairs, pairAnalysis.length);
  const criteria = {
    decisionDisagreements: { threshold: 3, observed: decisionRecords.length, passed: decisionRecords.length >= 3 },
    scenarioCoverage: { threshold: 2, observed: scenarios.size, passed: scenarios.size >= 2 },
    accessAssociatedPairs: { threshold: 1, observed: pairAnalysis.filter((pair) => pair.attribution === "access_associated").length, passed: pairAnalysis.some((pair) => pair.attribution === "access_associated") },
    validInitialPairRate: { threshold: 0.9, observed: validRate, passed: validRate !== null && validRate >= 0.9 },
  };
  return { passed: Object.values(criteria).every((criterion) => criterion.passed), criteria };
}

function countAttributions(pairs) {
  return pairs.reduce((counts, pair) => ({ ...counts, [pair.attribution]: (counts[pair.attribution] ?? 0) + 1 }), {});
}

function markdown(summary) {
  const gate = summary.currentPilot.fiveRepeatGate;
  return `# Information-View Pilot Handoff

## Status

This artifact reports ${summary.currentPilot.provenance === "live_evaluation" ? "observed live API results" : "a deterministic mock demonstration, not a research finding"}. The pilot contains ${summary.currentPilot.records} records across ${summary.currentPilot.pairs} paired comparisons.

An \`access_associated\` result means a disagreement was associated with different information access and disappeared under the full-information control. It does not establish faulty reasoning or an objective conflict.

## Observed paired results

- Attribution counts: ${JSON.stringify(summary.currentPilot.attributionCounts)}
- Decision disagreements eligible for strategy comparison: ${summary.currentPilot.strategyComparison.eligibility.decisionDisagreements}
- Five-repeat evaluation gate: ${gate.passed ? "PASS" : "DO NOT PROCEED YET"}
- Gate criteria: ${JSON.stringify(gate.criteria)}

## Arbitration comparison

Strategies were compared only on the identical set of valid initial decision-label disagreements. A correct policy decision is reported separately from conservative escalation.

${JSON.stringify(summary.currentPilot.strategyComparison.strategies, null, 2)}

## Historical experiment (separate)

${summary.historicalExperiment ? JSON.stringify(summary.historicalExperiment, null, 2) : "No historical report was supplied."}

## Limitations

- Mock outputs are illustrative only and never count as live findings.
- Live observations are run-specific and do not establish statistical significance.
- Information-access association is not evidence that either agent reasoned incorrectly.
- Deterministic policy verification remains authoritative; no real refund was executed.
`;
}

export async function writeArticleAgentHandoff({ records: inputs, historicalReport = null, markdownPath, jsonPath }) {
  const records = inputs.map((record) => decisionRecordSchema.parse(record));
  if (records.length === 0) throw new RangeError("Article handoff requires at least one record.");
  const pairAnalysis = analyzeInformationViewPairs(records);
  const summary = {
    generatedAt: new Date().toISOString(),
    currentPilot: {
      provenance: records[0].provenance,
      records: records.length,
      pairs: pairAnalysis.length,
      scenarios: [...new Set(records.map((record) => record.scenarioId))],
      attributionCounts: countAttributions(pairAnalysis),
      pairAnalysis,
      strategyComparison: compareDisagreementStrategies(records),
      fiveRepeatGate: evaluateFiveRepeatGate(pairAnalysis, records),
    },
    historicalExperiment: historicalReport,
  };
  await Promise.all([mkdir(dirname(markdownPath), { recursive: true }), mkdir(dirname(jsonPath), { recursive: true })]);
  await Promise.all([
    writeFile(markdownPath, markdown(summary), { encoding: "utf8", mode: 0o600 }),
    writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, { encoding: "utf8", mode: 0o600 }),
  ]);
  return summary;
}
