import { describe, expect, it } from "vitest";

import { classifyEvaluation } from "../../src/domain/classifyEvaluation.js";

function success(agent, decision) {
  return {
    status: "success",
    recommendation: {
      agent,
      decision,
      reason: "fixture",
      policyReferences: ["RPV1-1"],
      evidenceConsidered: ["daysSincePurchase"],
      missingInformation: [],
      conditions: [],
      requiresVerifiedEvidence: false,
    },
    meta: { model: "fixture", usage: null },
  };
}

const failure = {
  status: "failure",
  agent: "customer_resolution",
  category: "timeout",
  message: "fixture",
};

function input({ customer = "APPROVE", compliance = "APPROVE", conflict = "none", policy = "APPROVE" } = {}) {
  return {
    agentResults: {
      customerResolution: customer === "failure" ? failure : success("customer_resolution", customer),
      policyCompliance: success("policy_compliance", compliance),
    },
    conflict: { type: conflict },
    policyVerdict: { decision: policy },
  };
}

describe("classifyEvaluation", () => {
  it("classifies a decision-label mismatch as material", () => {
    expect(classifyEvaluation(input({ compliance: "REJECT", conflict: "decision_mismatch" }))).toEqual({
      classifications: ["decision_disagreement"],
      materialDisagreement: true,
    });
  });

  it("classifies a condition-only mismatch as non-material to the decision label", () => {
    expect(classifyEvaluation(input({ conflict: "condition_mismatch" }))).toEqual({
      classifications: ["condition_disagreement"],
      materialDisagreement: false,
    });
  });

  it("classifies valid agreement that differs from policy as incorrect consensus", () => {
    expect(classifyEvaluation(input({ customer: "REJECT", compliance: "REJECT", policy: "APPROVE" }))).toEqual({
      classifications: ["incorrect_consensus"],
      materialDisagreement: false,
    });
  });

  it("gives operational failure precedence over conflict labels", () => {
    expect(classifyEvaluation(input({ customer: "failure", conflict: "unknown" }))).toEqual({
      classifications: ["operational_failure"],
      materialDisagreement: false,
    });
  });

  it("classifies agreement with policy as correct consensus", () => {
    expect(classifyEvaluation(input())).toEqual({
      classifications: ["correct_consensus"],
      materialDisagreement: false,
    });
  });

  it("retains both condition disagreement and incorrect consensus when they overlap", () => {
    expect(classifyEvaluation(input({ customer: "REJECT", compliance: "REJECT", conflict: "condition_mismatch", policy: "APPROVE" }))).toEqual({
      classifications: ["condition_disagreement", "incorrect_consensus"],
      materialDisagreement: false,
    });
  });
});
