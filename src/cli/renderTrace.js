function decision(result) {
  return result.status === "success" ? result.recommendation.decision : `FAILED (${result.category})`;
}

export function renderTrace(record) {
  const heading = record.provenance === "mock_demonstration"
    ? "MOCK DEMONSTRATION — illustrative fixture, not a live model result"
    : "LIVE LLM EVALUATION — observed API result for this run";
  const arbitrator = record.arbitratorResult.status === "not_invoked"
    ? "not invoked"
    : decision(record.arbitratorResult);
  const policyDifferences = [
    ...record.conflict.diagnostics.policyReferences.customerOnly.map((value) => `customer:${value}`),
    ...record.conflict.diagnostics.policyReferences.complianceOnly.map((value) => `compliance:${value}`),
  ];
  return [
    `\n[${heading}]`,
    `Scenario ${record.scenarioId} / ${record.requestId} (repeat ${record.repeatIndex}, run ${record.runId})`,
    ...(record.experiment ? [`Experiment arm: ${record.experiment.arm}; pair=${record.experiment.pairId}; attribution=${record.experiment.pairAttribution}`] : []),
    `Request: ${record.request.daysSincePurchase} days; evidence=${record.request.evidenceStatus}; qualifyingIssue=${record.request.qualifyingDeliveryIssue}`,
    `Customer Resolution: ${decision(record.agentResults.customerResolution)}`,
    `Policy Compliance: ${decision(record.agentResults.policyCompliance)}`,
    `Conflict: ${record.conflict.type} — ${record.conflict.reason}`,
    `Evaluation classifications: ${record.evaluation.classifications.join(", ")} (material=${record.evaluation.materialDisagreement ? "yes" : "no"})`,
    `Diagnostic policy-reference differences: ${policyDifferences.join(", ") || "none"}`,
    `Arbitrator: ${arbitrator}`,
    `Policy verification: ${record.policyVerdict.decision} (${record.policyVerdict.ruleIds.join(", ")})`,
    `Final simulated disposition: ${record.finalDisposition}`,
    `Override: ${record.override.applied ? "yes" : "no"} — ${record.override.explanation}`,
    `Latency: ${record.timing.totalMs} ms; calls=${record.usage.callCount}; tokens=${record.usage.totalTokens}`,
  ].join("\n");
}
