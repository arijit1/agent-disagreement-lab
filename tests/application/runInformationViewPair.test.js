import { describe, expect, it } from "vitest";

import { runInformationViewPair } from "../../src/application/runInformationViewPair.js";
import { getScenario } from "../../fixtures/scenarios.js";

function response(recommendation) {
  return { recommendation, meta: { model: "paired-test", usage: null } };
}

function withDecision(recommendation, decision) {
  return { ...recommendation, decision, reason: `paired ${decision}` };
}

describe("runInformationViewPair", () => {
  it("runs asymmetric and full-information arms with stable pairing and access-associated attribution", async () => {
    const scenario = getScenario("S15");
    const calls = [];
    const providerFactory = ({ arm }) => ({
      evaluate(input) {
        calls.push({ arm, input });
        if (input.role === "arbitrator") return response({ ...withDecision(scenario.mock.policy_compliance.value, "REJECT"), agent: "arbitrator" });
        if (arm === "asymmetric" && input.role === "customer_resolution") {
          return response(withDecision(scenario.mock.customer_resolution.value, "APPROVE"));
        }
        return response(withDecision(scenario.mock[input.role].value, "REJECT"));
      },
    });

    const result = await runInformationViewPair({
      scenario,
      providerFactory,
      mode: "live",
      repeatIndex: 2,
      pairId: "pair-S15-2",
      idGenerator: (() => { let id = 0; return () => `run-${++id}`; })(),
    });

    expect(result.attribution).toBe("access_associated");
    expect(result.records).toHaveLength(2);
    expect(result.records.map((record) => [record.experiment.arm, record.experiment.executionOrder, record.experiment.pairId])).toEqual([
      ["asymmetric", 1, "pair-S15-2"],
      ["full_information", 2, "pair-S15-2"],
    ]);
    expect(result.records.every((record) => record.experiment.pairAttribution === "access_associated")).toBe(true);
    expect(result.records[0].conflict.type).toBe("decision_mismatch");
    expect(result.records[1].conflict.type).toBe("none");

    const asymmetricCustomer = calls.find((call) => call.arm === "asymmetric" && call.input.role === "customer_resolution");
    const fullCustomer = calls.find((call) => call.arm === "full_information" && call.input.role === "customer_resolution");
    expect(Object.keys(asymmetricCustomer.input.requestView)).toEqual(scenario.views.customer_resolution);
    expect(Object.keys(fullCustomer.input.requestView)).toEqual(Object.keys(scenario.request));
    expect(asymmetricCustomer.input.messages[1].content).not.toContain('"qualifyingDeliveryIssue"');
  });
});
