import { describe, expect, it } from "vitest";

import { buildAgentMessages } from "../../src/agents/prompts.js";
import { deriveAgentView } from "../../src/domain/deriveAgentView.js";
import { REFUND_POLICY_V1 } from "../../src/domain/refundPolicy.js";
import { getScenario } from "../../fixtures/scenarios.js";
import { ProviderError } from "../../src/providers/providerError.js";
import { createMockProvider } from "../../src/providers/mockProvider.js";

describe("mock provider", () => {
  it("returns deterministic structured fixture data with explicit mock metadata", async () => {
    const scenario = getScenario("S2");
    const provider = createMockProvider(scenario);
    const first = await provider.evaluate({ role: "customer_resolution" });
    const second = await provider.evaluate({ role: "customer_resolution" });
    expect(first).toEqual(second);
    expect(first.meta).toEqual({
      model: "mock-fixture",
      usage: null,
      attemptCount: 1,
      successfulAttempts: 1,
      failedAttempts: 0,
    });
    expect(first.recommendation.agent).toBe("customer_resolution");
  });

  it("returns only explicitly configured arbitrator fixtures", async () => {
    await expect(createMockProvider(getScenario("S2")).evaluate({ role: "arbitrator" })).resolves.toMatchObject({
      recommendation: { agent: "arbitrator", decision: "ESCALATE" },
    });
    await expect(createMockProvider(getScenario("S1")).evaluate({ role: "arbitrator" })).rejects.toMatchObject({
      category: "configuration_error",
    });
  });

  it("throws categorized fixture failures", async () => {
    const provider = createMockProvider(getScenario("S8"));
    await expect(provider.evaluate({ role: "customer_resolution" })).rejects.toEqual(
      expect.objectContaining({ name: "ProviderError", category: "timeout" }),
    );
    await expect(provider.evaluate({ role: "customer_resolution" })).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("agent message isolation", () => {
  it("gives each initial role the same policy and request but distinct instructions", () => {
    const request = getScenario("S2").request;
    const customer = buildAgentMessages({ role: "customer_resolution", request, policy: REFUND_POLICY_V1 });
    const compliance = buildAgentMessages({ role: "policy_compliance", request, policy: REFUND_POLICY_V1 });

    expect(customer).not.toBe(compliance);
    expect(customer[0].content).not.toBe(compliance[0].content);
    expect(JSON.parse(customer[1].content)).toMatchObject({ policyText: REFUND_POLICY_V1.text, request });
    expect(JSON.parse(compliance[1].content)).toMatchObject({ policyText: REFUND_POLICY_V1.text, request });
    expect(customer[1].content).not.toContain("policy_compliance recommendation");
    expect(compliance[1].content).not.toContain("customer_resolution recommendation");
  });

  it("shows validated initial recommendations only to the arbitrator", () => {
    const scenario = getScenario("S2");
    const recommendations = [
      scenario.mock.customer_resolution.value,
      scenario.mock.policy_compliance.value,
    ];
    const messages = buildAgentMessages({
      role: "arbitrator",
      request: scenario.request,
      policy: REFUND_POLICY_V1,
      recommendations,
    });
    expect(messages[1].content).toContain("customer_resolution");
    expect(messages[1].content).toContain("policy_compliance");
  });

  it("never exposes challenge metadata or expected verdicts to initial agents", () => {
    const scenario = getScenario("S10");
    const messages = buildAgentMessages({
      role: "customer_resolution",
      request: scenario.request,
      policy: REFUND_POLICY_V1,
    });
    const payload = JSON.parse(messages[1].content);

    expect(payload).toEqual({
      policyVersion: REFUND_POLICY_V1.version,
      policyText: REFUND_POLICY_V1.text,
      request: scenario.request,
    });
    expect(messages[1].content).not.toContain("targetDisagreement");
    expect(messages[1].content).not.toContain("expectedPolicyVerdict");
    expect(messages[1].content).not.toContain("disagreement_challenge");
  });

  it("shows an information-view agent only its application-derived facts", () => {
    const scenario = getScenario("S15");
    const fields = scenario.views.customer_resolution;
    const facts = deriveAgentView(scenario.request, fields);
    const messages = buildAgentMessages({
      role: "customer_resolution",
      requestView: { visibleFields: fields, facts },
      policy: REFUND_POLICY_V1,
    });
    const payload = JSON.parse(messages[1].content);

    expect(payload.availableRequestFacts).toEqual(facts);
    expect(payload.visibleFields).toEqual(fields);
    expect(payload).not.toHaveProperty("request");
    expect(messages[1].content).not.toContain("qualifyingDeliveryIssue");
    expect(messages[0].content).toMatch(/omitted facts were not available/i);
  });

  it("shows the arbitrator the canonical request and both view manifests", () => {
    const scenario = getScenario("S15");
    const viewManifests = {
      customerResolution: {
        visibleFields: scenario.views.customer_resolution,
        facts: deriveAgentView(scenario.request, scenario.views.customer_resolution),
      },
      policyCompliance: {
        visibleFields: scenario.views.policy_compliance,
        facts: deriveAgentView(scenario.request, scenario.views.policy_compliance),
      },
    };
    const recommendations = [scenario.mock.customer_resolution.value, scenario.mock.policy_compliance.value];
    const messages = buildAgentMessages({
      role: "arbitrator",
      request: scenario.request,
      policy: REFUND_POLICY_V1,
      recommendations,
      viewManifests,
    });
    expect(JSON.parse(messages[1].content)).toMatchObject({ request: scenario.request, viewManifests });
  });
});
