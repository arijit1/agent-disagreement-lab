import { describe, expect, it } from "vitest";

import { evaluateRefundPolicy } from "../../src/domain/evaluateRefundPolicy.js";
import { agentRecommendationSchema, refundRequestSchema } from "../../src/domain/schemas.js";
import { SCENARIOS, getScenario, listScenarios } from "../../fixtures/scenarios.js";

const expected = {
  S1: "APPROVE",
  S2: "ESCALATE",
  S3: "APPROVE",
  S4: "REJECT",
  S5: "ESCALATE",
  S6: "ESCALATE",
  S7: "ESCALATE",
  S8: "ESCALATE",
  S9: "APPROVE",
  S10: "ESCALATE",
  S11: "ESCALATE",
  S12: "REJECT",
  S13: "REJECT",
  S14: "APPROVE",
  S15: "REJECT",
  S16: "ESCALATE",
  S17: "APPROVE",
  S18: "ESCALATE",
  S19: "REJECT",
  S20: "APPROVE",
};

describe("scenario fixtures", () => {
  it("defines exactly S1 through S20 in stable order", () => {
    expect(listScenarios().map((scenario) => scenario.id)).toEqual(Object.keys(expected));
  });

  it("selects only the disagreement challenge cohort", () => {
    expect(listScenarios({ suite: "disagreement" }).map((scenario) => scenario.id)).toEqual([
      "S9", "S10", "S11", "S12", "S13", "S14",
    ]);
  });

  it("selects only the information-view cohort with valid role allowlists", () => {
    const selected = listScenarios({ suite: "information-view" });
    expect(selected.map((scenario) => scenario.id)).toEqual(["S15", "S16", "S17", "S18", "S19", "S20"]);
    for (const scenario of selected) {
      expect(scenario.views.customer_resolution.length).toBeGreaterThan(0);
      expect(scenario.views.policy_compliance.length).toBeGreaterThan(0);
      expect(new Set(scenario.views.customer_resolution).size).toBe(scenario.views.customer_resolution.length);
      expect(new Set(scenario.views.policy_compliance).size).toBe(scenario.views.policy_compliance.length);
    }
  });

  it.each(Object.entries(expected))("%s validates and matches canonical policy verdict %s", (id, decision) => {
    const scenario = getScenario(id);
    expect(refundRequestSchema.parse(scenario.request)).toEqual(scenario.request);
    expect(scenario.expectedPolicyVerdict).toBe(decision);
    expect(evaluateRefundPolicy(scenario.request).decision).toBe(decision);
  });

  it("keeps all normal fixture recommendations schema-valid", () => {
    for (const scenario of SCENARIOS) {
      for (const role of ["customer_resolution", "policy_compliance", "arbitrator"]) {
        const outcome = scenario.mock[role];
        if (outcome?.kind === "recommendation") {
          expect(agentRecommendationSchema.parse(outcome.value)).toEqual(outcome.value);
        }
      }
    }
  });

  it("contains false consensus only in S5 and a wrong arbitrator only in S6", () => {
    const s5 = getScenario("S5");
    expect(s5.mock.customer_resolution.value.decision).toBe("APPROVE");
    expect(s5.mock.policy_compliance.value.decision).toBe("APPROVE");
    expect(s5.expectedPolicyVerdict).toBe("ESCALATE");

    const s6 = getScenario("S6");
    expect(s6.mock.arbitrator.value.decision).toBe("APPROVE");
    expect(s6.expectedPolicyVerdict).toBe("ESCALATE");
  });

  it("keeps challenge mock responses aligned with canonical policy", () => {
    for (const scenario of listScenarios({ suite: "disagreement" })) {
      expect(scenario.mock.customer_resolution.value.decision).toBe(scenario.expectedPolicyVerdict);
      expect(scenario.mock.policy_compliance.value.decision).toBe(scenario.expectedPolicyVerdict);
      expect(scenario.mock.arbitrator).toBeUndefined();
    }
  });

  it("keeps information-view mock responses policy-correct and non-arbitrated", () => {
    for (const scenario of listScenarios({ suite: "information-view" })) {
      expect(scenario.mock.customer_resolution.value.decision).toBe(scenario.expectedPolicyVerdict);
      expect(scenario.mock.policy_compliance.value.decision).toBe(scenario.expectedPolicyVerdict);
      expect(scenario.mock.arbitrator).toBeUndefined();
    }
  });

  it("models S8 as one timeout without corrupting its request", () => {
    const scenario = getScenario("S8");
    expect(scenario.mock.customer_resolution).toMatchObject({ kind: "failure", category: "timeout" });
    expect(refundRequestSchema.safeParse(scenario.request).success).toBe(true);
  });

  it("rejects an unknown scenario", () => {
    expect(() => getScenario("S99")).toThrow(/Unknown scenario/);
  });
});
