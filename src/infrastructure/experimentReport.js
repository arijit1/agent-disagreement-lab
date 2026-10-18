import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { decisionRecordSchema } from "../domain/schemas.js";
import { analyzeInformationViewPairs } from "../domain/analyzeInformationViewPairs.js";
import { compareDisagreementStrategies } from "../domain/compareDisagreementStrategies.js";

const classificationTypes = [
  "decision_disagreement",
  "condition_disagreement",
  "incorrect_consensus",
  "operational_failure",
  "correct_consensus",
];

function countBy(values, keys = []) {
  const counts = Object.fromEntries(keys.map((key) => [key, 0]));
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function ratio(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

function summarize(records) {
  const validInitialComparisons = records.filter((record) => !record.evaluation.classifications.includes("operational_failure")).length;
  const materialDisagreements = records.filter((record) => record.evaluation.materialDisagreement).length;
  const invoked = records.filter((record) => record.arbitratorResult.status !== "not_invoked");
  const successful = invoked.filter((record) => record.arbitratorResult.status === "success");
  const correctDecisions = successful.filter((record) => record.arbitratorResult.recommendation.decision === record.policyVerdict.decision).length;
  const conservativeEscalations = successful.filter((record) => (
    record.arbitratorResult.recommendation.decision === "ESCALATE" && record.policyVerdict.decision !== "ESCALATE"
  )).length;
  const incorrectDecisions = successful.length - correctDecisions - conservativeEscalations;
  const totalLatencyMs = records.reduce((total, record) => total + record.timing.totalMs, 0);
  const totalTokens = records.reduce((total, record) => total + record.usage.totalTokens, 0);

  return {
    runs: records.length,
    validInitialComparisons,
    classifications: countBy(records.flatMap((record) => record.evaluation.classifications), classificationTypes),
    materialDisagreements,
    materialDisagreementRate: ratio(materialDisagreements, validInitialComparisons),
    decisionPairs: countBy(records.map((record) => {
      const customer = record.agentResults.customerResolution;
      const compliance = record.agentResults.policyCompliance;
      const customerDecision = customer.status === "success" ? customer.recommendation.decision : "FAILURE";
      const complianceDecision = compliance.status === "success" ? compliance.recommendation.decision : "FAILURE";
      return `${customerDecision}|${complianceDecision}`;
    })),
    verificationOutcomes: countBy(records.map((record) => record.policyVerdict.decision), ["APPROVE", "REJECT", "ESCALATE"]),
    arbitration: {
      invoked: invoked.length,
      successful: successful.length,
      correctDecisions,
      conservativeEscalations,
      incorrectDecisions,
      policyAccuracy: ratio(correctDecisions, successful.length),
    },
    latency: {
      totalMs: totalLatencyMs,
      averageMs: ratio(totalLatencyMs, records.length),
    },
    tokenUsage: {
      totalTokens,
      averageTokens: ratio(totalTokens, records.length),
    },
  };
}

export function buildExperimentReport(inputs) {
  const records = inputs.map((record) => decisionRecordSchema.parse(record));
  if (records.length === 0) throw new RangeError("Experiment report requires at least one record");
  const provenances = new Set(records.map((record) => record.provenance));
  if (provenances.size !== 1) throw new Error("Experiment report cannot mix mock and live provenance");
  const grouped = new Map();
  for (const record of records) {
    const group = grouped.get(record.scenarioId) ?? [];
    group.push(record);
    grouped.set(record.scenarioId, group);
  }

  const informationViewRecords = records.filter((record) => record.experiment?.suite === "information-view");
  const pairAnalysis = informationViewRecords.length > 0 ? analyzeInformationViewPairs(informationViewRecords) : [];
  const informationView = informationViewRecords.length === 0 ? null : {
    records: informationViewRecords.length,
    pairs: pairAnalysis.length,
    attributionCounts: countBy(pairAnalysis.map((pair) => pair.attribution), [
      "access_associated", "persistent_across_arms", "control_only", "no_decision_disagreement", "unclassifiable_operational_failure",
    ]),
    pairAnalysis,
    strategyComparison: compareDisagreementStrategies(informationViewRecords),
    interpretation: "Access-associated means the observed decision disagreement appeared under different information access and disappeared in the full-information control; it is not evidence of reasoning failure.",
  };

  return {
    provenance: records[0].provenance,
    totalRuns: records.length,
    scenarioCount: grouped.size,
    overall: summarize(records),
    scenarios: [...grouped.entries()].map(([scenarioId, scenarioRecords]) => ({
      scenarioId,
      expectedPolicyVerdict: scenarioRecords[0].expectedPolicyVerdict,
      ...summarize(scenarioRecords),
    })),
    informationView,
    limitations: [
      "Mock provenance is a deterministic demonstration and is not a live model finding.",
      "Live results describe only the observed API calls and do not establish statistical significance.",
      "Arbitrator accuracy is conditional on successful arbitration calls; conservative escalation is reported separately from a correct policy decision.",
      "The deterministic policy verifier remains the final authority and no real refund is executed.",
      "Five repeats per scenario are useful for exploration but insufficient for strong statistical claims.",
    ],
  };
}

export async function writeExperimentReport({ records, outputPath }) {
  const report = buildExperimentReport(records);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return report;
}
