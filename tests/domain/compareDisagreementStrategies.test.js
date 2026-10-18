import { describe, expect, it } from "vitest";

import { runInformationViewPair } from "../../src/application/runInformationViewPair.js";
import { compareDisagreementStrategies } from "../../src/domain/compareDisagreementStrategies.js";
import { getScenario } from "../../fixtures/scenarios.js";

function response(value) {
  return {
    recommendation: value,
    meta: { model: "strategy-test", usage: { inputTokens: 4, outputTokens: 1, totalTokens: 5 } },
  };
}

async function records() {
  const scenario = getScenario("S15");
  const result = await runInformationViewPair({
    scenario,
    mode: "live",
    repeatIndex: 1,
    pairId: "pair-strategy",
    idGenerator: (() => { let index = 0; return () => `strategy-${++index}`; })(),
    providerFactory: ({ arm }) => ({
      evaluate({ role }) {
        const source = role === "arbitrator" ? scenario.mock.policy_compliance.value : scenario.mock[role].value;
        const decision = role === "customer_resolution" ? "APPROVE" : "REJECT";
        return response({ ...source, agent: role, decision, reason: `${arm} ${role}` });
      },
    }),
  });
  const conditionOnly = structuredClone(result.records[1]);
  conditionOnly.runId = "condition-only";
  conditionOnly.conflict.type = "condition_mismatch";
  conditionOnly.evaluation = { classifications: ["condition_disagreement"], materialDisagreement: true };
  return [result.records[0], conditionOnly];
}

describe("compareDisagreementStrategies", () => {
  it("uses one identical valid decision-disagreement set for every strategy", async () => {
    const comparison = compareDisagreementStrategies(await records());
    expect(comparison.eligibility).toMatchObject({ inputRecords: 2, decisionDisagreements: 1, excludedRecords: 1 });
    expect(new Set(Object.values(comparison.strategies).map((value) => value.eligibleDisagreements))).toEqual(new Set([1]));
    expect(comparison.strategies.arbitrator.policyAccuracy).toBe(1);
    expect(comparison.strategies.customer.policyAccuracy).toBe(0);
    expect(comparison.strategies.compliance.policyAccuracy).toBe(1);
    expect(comparison.strategies.conservative_escalation).toMatchObject({
      policyAccuracy: 0,
      decisiveAccuracy: null,
      conservativeEscalations: 1,
      unnecessaryEscalations: 1,
    });
    expect(comparison.strategies.arbitrator.tokenUsage.totalTokens).toBe(5);
  });

  it("returns explicit zero denominators without division errors", () => {
    const comparison = compareDisagreementStrategies([]);
    expect(comparison.eligibility.decisionDisagreements).toBe(0);
    expect(comparison.strategies.arbitrator).toMatchObject({ evaluated: 0, policyAccuracy: null, decisiveAccuracy: null });
  });
});
