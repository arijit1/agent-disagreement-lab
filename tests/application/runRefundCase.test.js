import { describe, expect, it, vi } from "vitest";

import { runRefundCase } from "../../src/application/runRefundCase.js";
import { evaluateRefundPolicy } from "../../src/domain/evaluateRefundPolicy.js";
import { deriveAgentView } from "../../src/domain/deriveAgentView.js";
import { getScenario } from "../../fixtures/scenarios.js";
import { createMockProvider } from "../../src/providers/mockProvider.js";
import { ProviderError } from "../../src/providers/providerError.js";

const runtime = {
  clock: { now: () => Date.parse("2026-10-13T10:00:00.000Z") },
  idGenerator: () => "run-test",
};

function fixtureResult(scenario, role) {
  return {
    recommendation: scenario.mock[role].value,
    meta: { model: "test-provider", usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
  };
}

describe("runRefundCase", () => {
  it("starts both isolated initial evaluations before either settles", async () => {
    const scenario = getScenario("S1");
    const pending = new Map();
    const calls = [];
    const provider = {
      evaluate(input) {
        calls.push(input);
        return new Promise((resolve) => pending.set(input.role, () => resolve(fixtureResult(scenario, input.role))));
      },
    };

    const run = runRefundCase({ scenario, provider, mode: "mock", repeatIndex: 1, ...runtime });
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls.map((call) => call.role)).toEqual(["customer_resolution", "policy_compliance"]);
    expect(calls[0].messages).not.toBe(calls[1].messages);
    expect(calls[0].recommendations).toBeUndefined();
    expect(calls[1].recommendations).toBeUndefined();
    pending.get("customer_resolution")();
    pending.get("policy_compliance")();

    await expect(run).resolves.toMatchObject({ finalDisposition: "APPROVE" });
  });

  it("records a wrong arbitrator recommendation independently before policy overrides it", async () => {
    const scenario = getScenario("S6");
    const record = await runRefundCase({ scenario, provider: createMockProvider(scenario), mode: "mock", repeatIndex: 1, ...runtime });

    expect(record.conflict.type).toBe("decision_mismatch");
    expect(record.evaluation).toEqual({ classifications: ["decision_disagreement"], materialDisagreement: true });
    expect(record.arbitratorResult).toMatchObject({ status: "success", recommendation: { decision: "APPROVE" } });
    expect(record.proposedOutcome).toBe("APPROVE");
    expect(record.policyVerdict.decision).toBe("ESCALATE");
    expect(record.finalDisposition).toBe("ESCALATE");
    expect(record.override.applied).toBe(true);
  });

  it("always verifies false consensus and skips arbitration", async () => {
    const scenario = getScenario("S5");
    const policyEvaluator = vi.fn(evaluateRefundPolicy);
    const record = await runRefundCase({ scenario, provider: createMockProvider(scenario), mode: "mock", repeatIndex: 1, policyEvaluator, ...runtime });

    expect(record.conflict.type).toBe("none");
    expect(record.evaluation).toEqual({ classifications: ["incorrect_consensus"], materialDisagreement: false });
    expect(record.arbitratorResult.status).toBe("not_invoked");
    expect(record.proposedOutcome).toBe("APPROVE");
    expect(record.policyVerdict.decision).toBe("ESCALATE");
    expect(record.finalDisposition).toBe("ESCALATE");
    expect(policyEvaluator).toHaveBeenCalledOnce();
  });

  it("never lets a model recommendation upgrade application-controlled evidence", async () => {
    const scenario = getScenario("S5");
    const record = await runRefundCase({ scenario, provider: createMockProvider(scenario), mode: "mock", repeatIndex: 1, ...runtime });
    expect(record.agentResults.customerResolution.recommendation.decision).toBe("APPROVE");
    expect(record.request.evidenceStatus).toBe("missing");
    expect(record.policyVerdict.decision).toBe("ESCALATE");
  });

  it("converts a timeout to an unknown conflict, skips arbitration, and fails closed", async () => {
    const scenario = getScenario("S8");
    const record = await runRefundCase({ scenario, provider: createMockProvider(scenario), mode: "mock", repeatIndex: 1, ...runtime });
    expect(record.agentResults.customerResolution).toMatchObject({ status: "failure", category: "timeout" });
    expect(record.conflict.type).toBe("unknown");
    expect(record.evaluation).toEqual({ classifications: ["operational_failure"], materialDisagreement: false });
    expect(record.arbitratorResult.status).toBe("not_invoked");
    expect(record.finalDisposition).toBe("ESCALATE");
  });

  it("fails closed when one initial call fails even if deterministic policy would approve", async () => {
    const scenario = getScenario("S1");
    const provider = {
      async evaluate({ role }) {
        if (role === "customer_resolution") throw new ProviderError("timeout", "Timed out");
        return fixtureResult(scenario, role);
      },
    };
    const record = await runRefundCase({ scenario, provider, mode: "live", repeatIndex: 2, ...runtime });
    expect(record.policyVerdict.decision).toBe("APPROVE");
    expect(record.finalDisposition).toBe("ESCALATE");
    expect(record.provenance).toBe("live_evaluation");
    expect(record.repeatIndex).toBe(2);
  });

  it("categorizes malformed structured output and does not expose its contents", async () => {
    const scenario = getScenario("S1");
    const provider = {
      async evaluate({ role }) {
        if (role === "customer_resolution") return { recommendation: { decision: "PAY_NOW", secret: "do-not-log" } };
        return fixtureResult(scenario, role);
      },
    };
    const record = await runRefundCase({ scenario, provider, mode: "live", repeatIndex: 1, ...runtime });
    expect(record.agentResults.customerResolution).toMatchObject({
      status: "failure",
      agent: "customer_resolution",
      category: "invalid_output",
      message: "Provider returned invalid structured output.",
      diagnostic: { code: "schema_validation", attemptCount: 1 },
    });
    expect(JSON.stringify(record)).not.toContain("do-not-log");
  });

  it("records arbitrator failure separately and fails closed", async () => {
    const scenario = getScenario("S2");
    const mock = createMockProvider(scenario);
    const provider = {
      evaluate(input) {
        if (input.role === "arbitrator") throw new ProviderError("provider_error", "Arbitrator unavailable");
        return mock.evaluate(input);
      },
    };
    const record = await runRefundCase({ scenario, provider, mode: "live", repeatIndex: 1, ...runtime });
    expect(record.arbitratorResult).toMatchObject({ status: "failure", agent: "arbitrator", category: "provider_error" });
    expect(record.proposedOutcome).toBeNull();
    expect(record.policyVerdict.decision).toBe("ESCALATE");
    expect(record.finalDisposition).toBe("ESCALATE");
  });

  it("retains sanitized failure diagnostics and counts failed provider attempts", async () => {
    const scenario = getScenario("S1");
    const provider = {
      evaluate({ role }) {
        if (role === "customer_resolution") {
          throw new ProviderError("invalid_output", "raw secret output", {
            diagnosticCode: "schema_validation",
            attemptCount: 2,
            usage: { inputTokens: 20, outputTokens: 30, totalTokens: 50 },
            model: "test-model",
          });
        }
        return fixtureResult(scenario, role);
      },
    };
    const record = await runRefundCase({ scenario, provider, mode: "live", repeatIndex: 1, ...runtime });
    expect(record.agentResults.customerResolution).toMatchObject({
      status: "failure",
      category: "invalid_output",
      diagnostic: { code: "schema_validation", attemptCount: 2 },
    });
    expect(record.usage).toMatchObject({
      callCount: 2,
      attemptCount: 3,
      successfulAttempts: 1,
      failedAttempts: 2,
      totalTokens: 65,
    });
    expect(JSON.stringify(record)).not.toContain("raw secret output");
  });

  it("passes only frozen assigned views to initial providers while verifying the canonical request", async () => {
    const scenario = getScenario("S15");
    const policyEvaluator = vi.fn(evaluateRefundPolicy);
    const calls = [];
    const agentViews = {
      customerResolution: {
        visibleFields: scenario.views.customer_resolution,
        facts: deriveAgentView(scenario.request, scenario.views.customer_resolution),
      },
      policyCompliance: {
        visibleFields: scenario.views.policy_compliance,
        facts: deriveAgentView(scenario.request, scenario.views.policy_compliance),
      },
    };
    const provider = {
      evaluate(input) {
        calls.push(input);
        expect(input.request).toBeUndefined();
        expect(Object.isFrozen(input.requestView)).toBe(true);
        return fixtureResult(scenario, input.role);
      },
    };
    const record = await runRefundCase({
      scenario,
      provider,
      mode: "mock",
      repeatIndex: 1,
      policyEvaluator,
      experimentContext: {
        suite: "information-view",
        arm: "asymmetric",
        pairId: "pair-S15-1",
        executionOrder: 1,
        agentViews,
        pairAttribution: null,
      },
      ...runtime,
    });

    expect(calls[0].requestView).toEqual(agentViews.customerResolution.facts);
    expect(calls[1].requestView).toEqual(agentViews.policyCompliance.facts);
    expect(policyEvaluator).toHaveBeenCalledWith(scenario.request);
    expect(record.request).toEqual(scenario.request);
    expect(record.experiment).toMatchObject({ arm: "asymmetric", pairId: "pair-S15-1", agentViews });
  });
});
