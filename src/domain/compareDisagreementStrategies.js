import { decisionRecordSchema } from "./schemas.js";

const ratio = (numerator, denominator) => denominator === 0 ? null : numerator / denominator;

function choice(record, strategy) {
  if (strategy === "customer") return record.agentResults.customerResolution.recommendation.decision;
  if (strategy === "compliance") return record.agentResults.policyCompliance.recommendation.decision;
  if (strategy === "conservative_escalation") return "ESCALATE";
  return record.arbitratorResult.status === "success" ? record.arbitratorResult.recommendation.decision : null;
}

function cost(record, strategy) {
  if (strategy === "conservative_escalation") return { latencyMs: 0, tokens: 0 };
  if (strategy === "arbitrator") {
    const usage = record.arbitratorResult.status === "success" ? record.arbitratorResult.meta.usage : null;
    return { latencyMs: record.timing.arbitratorMs ?? 0, tokens: usage?.totalTokens ?? 0 };
  }
  const key = strategy === "customer" ? "customerResolution" : "policyCompliance";
  const usage = record.agentResults[key].meta.usage;
  return { latencyMs: record.timing.initialAgentsMs, tokens: usage?.totalTokens ?? 0 };
}

function summarize(records, strategy) {
  const rows = records.map((record) => ({ record, decision: choice(record, strategy), ...cost(record, strategy) }));
  const evaluated = rows.filter((row) => row.decision !== null);
  const correct = evaluated.filter((row) => row.decision === row.record.policyVerdict.decision).length;
  const decisive = evaluated.filter((row) => row.decision !== "ESCALATE");
  const decisiveCorrect = decisive.filter((row) => row.decision === row.record.policyVerdict.decision).length;
  const conservativeEscalations = evaluated.filter((row) => row.decision === "ESCALATE" && row.record.policyVerdict.decision !== "ESCALATE").length;
  const latencyMs = evaluated.reduce((total, row) => total + row.latencyMs, 0);
  const tokens = evaluated.reduce((total, row) => total + row.tokens, 0);
  return {
    eligibleDisagreements: records.length,
    evaluated: evaluated.length,
    unavailable: records.length - evaluated.length,
    correctDecisions: correct,
    policyAccuracy: ratio(correct, evaluated.length),
    decisiveDecisions: decisive.length,
    decisiveCorrect,
    decisiveAccuracy: ratio(decisiveCorrect, decisive.length),
    conservativeEscalations,
    conservativeEscalationRate: ratio(conservativeEscalations, evaluated.length),
    unnecessaryEscalations: conservativeEscalations,
    unnecessaryEscalationRate: ratio(conservativeEscalations, evaluated.length),
    latency: { totalMs: latencyMs, averageMs: ratio(latencyMs, evaluated.length) },
    tokenUsage: { totalTokens: tokens, averageTokens: ratio(tokens, evaluated.length) },
  };
}

export function compareDisagreementStrategies(inputs) {
  const records = inputs.map((record) => decisionRecordSchema.parse(record));
  const eligibleRecords = records.filter((record) => (
    record.conflict.type === "decision_mismatch"
    && !record.evaluation.classifications.includes("operational_failure")
  ));
  return {
    eligibility: {
      inputRecords: records.length,
      decisionDisagreements: eligibleRecords.length,
      excludedRecords: records.length - eligibleRecords.length,
      rule: "Valid initial decision-label disagreements only; condition-only conflicts and operational failures are excluded.",
      runIds: eligibleRecords.map((record) => record.runId),
    },
    strategies: Object.fromEntries(
      ["arbitrator", "customer", "compliance", "conservative_escalation"]
        .map((strategy) => [strategy, summarize(eligibleRecords, strategy)]),
    ),
  };
}
