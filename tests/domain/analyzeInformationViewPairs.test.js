import { describe, expect, it } from "vitest";

import { runInformationViewPair } from "../../src/application/runInformationViewPair.js";
import { analyzeInformationViewPairs } from "../../src/domain/analyzeInformationViewPairs.js";
import { getScenario } from "../../fixtures/scenarios.js";

function response(value) {
  return { recommendation: value, meta: { model: "pair-test", usage: null } };
}

async function pair({ asymmetric = false, control = false } = {}) {
  const scenario = getScenario("S15");
  return runInformationViewPair({
    scenario,
    mode: "live",
    repeatIndex: 1,
    pairId: "pair-1",
    idGenerator: (() => { let index = 0; return () => `run-${++index}`; })(),
    providerFactory: ({ arm }) => ({
      evaluate({ role }) {
        const decisionMismatch = arm === "asymmetric" ? asymmetric : control;
        const source = role === "arbitrator" ? scenario.mock.policy_compliance.value : scenario.mock[role].value;
        const decision = decisionMismatch && role === "customer_resolution" ? "APPROVE" : "REJECT";
        return response({ ...source, agent: role, decision, reason: `${arm} ${role}` });
      },
    }),
  });
}

describe("analyzeInformationViewPairs", () => {
  it.each([
    [{ asymmetric: true }, "access_associated"],
    [{ asymmetric: true, control: true }, "persistent_across_arms"],
    [{ control: true }, "control_only"],
    [{}, "no_decision_disagreement"],
  ])("classifies paired decision disagreement patterns", async (pattern, expected) => {
    const result = await pair(pattern);
    expect(analyzeInformationViewPairs(result.records)[0].attribution).toBe(expected);
  });

  it("never attributes a pair with an operational failure to information access", async () => {
    const result = await pair({ asymmetric: true });
    const records = structuredClone(result.records);
    records[0].evaluation = { classifications: ["operational_failure"], materialDisagreement: false };
    expect(analyzeInformationViewPairs(records)[0].attribution).toBe("unclassifiable_operational_failure");
  });

  it("rejects missing and duplicate arms", async () => {
    const result = await pair();
    expect(() => analyzeInformationViewPairs([result.records[0]])).toThrow(/exactly one/);
    expect(() => analyzeInformationViewPairs([result.records[0], result.records[0]])).toThrow(/exactly one/);
  });
});
