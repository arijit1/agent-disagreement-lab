import { describe, expect, it } from "vitest";

import { detectConflict } from "../../src/domain/detectConflict.js";

function success(agent, overrides = {}) {
  return {
    status: "success",
    recommendation: {
      agent,
      decision: "ESCALATE",
      reason: "Review required.",
      policyReferences: ["RPV1-2", "RPV1-4"],
      evidenceConsidered: ["qualifyingDeliveryIssue", "evidenceStatus"],
      missingInformation: [],
      conditions: [],
      requiresVerifiedEvidence: true,
      ...overrides,
    },
    meta: { model: "test", usage: null },
  };
}

describe("detectConflict", () => {
  it("classifies different decision labels as a decision mismatch", () => {
    const result = detectConflict(
      success("customer_resolution", { decision: "APPROVE" }),
      success("policy_compliance"),
    );
    expect(result.type).toBe("decision_mismatch");
  });

  it("classifies a material evidence requirement difference when decisions match", () => {
    const result = detectConflict(
      success("customer_resolution", { requiresVerifiedEvidence: false }),
      success("policy_compliance", { requiresVerifiedEvidence: true }),
    );
    expect(result.type).toBe("condition_mismatch");
    expect(result.diagnostics.evidenceInterpretations.requiresVerifiedEvidence).toEqual({
      customer: false,
      compliance: true,
      differs: true,
    });
  });

  it("returns no conflict for matching decisions and material conditions", () => {
    expect(detectConflict(success("customer_resolution"), success("policy_compliance")).type).toBe("none");
  });

  it("returns unknown when either agent is unavailable", () => {
    const failure = { status: "failure", agent: "customer_resolution", category: "timeout", message: "Timed out" };
    const result = detectConflict(failure, success("policy_compliance"));
    expect(result.type).toBe("unknown");
    expect(result.diagnostics.evidenceInterpretations.requiresVerifiedEvidence).toEqual({
      customer: null,
      compliance: true,
      differs: false,
    });
  });

  it("records differing and shared policy references independently of conflict type", () => {
    const result = detectConflict(
      success("customer_resolution", { policyReferences: ["RPV1-2", "RPV1-4"] }),
      success("policy_compliance", { policyReferences: ["RPV1-2", "RPV1-6"] }),
    );
    expect(result.type).toBe("none");
    expect(result.diagnostics.policyReferences).toEqual({
      customerOnly: ["RPV1-4"],
      complianceOnly: ["RPV1-6"],
      shared: ["RPV1-2"],
    });
  });

  it("records differing evidence fields without changing a matching decision", () => {
    const result = detectConflict(
      success("customer_resolution", { evidenceConsidered: ["deliveryIssueReported"] }),
      success("policy_compliance", { evidenceConsidered: ["deliveryIssueReported", "evidenceStatus"] }),
    );
    expect(result.type).toBe("none");
    expect(result.diagnostics.evidenceInterpretations).toMatchObject({
      customerOnly: [],
      complianceOnly: ["evidenceStatus"],
      shared: ["deliveryIssueReported"],
    });
  });
});
