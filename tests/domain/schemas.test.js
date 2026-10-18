import { describe, expect, it } from "vitest";

import {
  agentRecommendationSchema,
  decisionRecordSchema,
  experimentResultSchema,
  experimentArmSchema,
  pairAttributionSchema,
  providerDiagnosticCodeSchema,
  requestViewSchema,
  viewManifestSchema,
  refundRequestSchema,
} from "../../src/domain/schemas.js";

const request = {
  requestId: "REF-101",
  daysSincePurchase: 32,
  standardReturnConditionsMet: true,
  refundReason: "Damaged during delivery",
  deliveryIssueReported: true,
  qualifyingDeliveryIssue: null,
  evidenceStatus: "missing",
};

const recommendation = {
  agent: "customer_resolution",
  decision: "APPROVE",
  reason: "Offer a customer-friendly exception.",
  policyReferences: ["RPV1-2", "RPV1-4"],
  evidenceConsidered: ["deliveryIssueReported", "evidenceStatus"],
  missingInformation: ["Verified delivery evidence"],
  conditions: ["Obtain evidence"],
  requiresVerifiedEvidence: false,
};

describe("refundRequestSchema", () => {
  it("accepts application-controlled canonical request fields", () => {
    expect(refundRequestSchema.parse(request)).toEqual(request);
  });

  it.each([
    ["unknown evidence status", { ...request, evidenceStatus: "claimed" }],
    ["negative days", { ...request, daysSincePurchase: -1 }],
    ["fractional days", { ...request, daysSincePurchase: 1.5 }],
    ["extra policy input", { ...request, modelEvidenceUpgrade: true }],
  ])("rejects %s", (_name, value) => {
    expect(() => refundRequestSchema.parse(value)).toThrow();
  });
});

describe("information-view schemas", () => {
  it("accepts a strict partial request and a matching view manifest", () => {
    const facts = { requestId: "REF-101", refundReason: "Damaged during delivery" };
    expect(requestViewSchema.parse(facts)).toEqual(facts);
    expect(viewManifestSchema.parse({ visibleFields: ["requestId", "refundReason"], facts })).toEqual({
      visibleFields: ["requestId", "refundReason"],
      facts,
    });
  });

  it("rejects manifests whose field list does not exactly match the facts", () => {
    expect(() => viewManifestSchema.parse({
      visibleFields: ["requestId", "evidenceStatus"],
      facts: { requestId: "REF-101" },
    })).toThrow();
  });

  it("defines closed experiment and diagnostic vocabularies", () => {
    expect(experimentArmSchema.parse("asymmetric")).toBe("asymmetric");
    expect(experimentArmSchema.parse("full_information")).toBe("full_information");
    expect(pairAttributionSchema.parse("access_associated")).toBe("access_associated");
    expect(providerDiagnosticCodeSchema.parse("incomplete_max_output_tokens")).toBe("incomplete_max_output_tokens");
    expect(() => providerDiagnosticCodeSchema.parse("raw_model_text")).toThrow();
  });
});

describe("agentRecommendationSchema", () => {
  it("accepts a complete structured recommendation", () => {
    expect(agentRecommendationSchema.parse(recommendation)).toEqual(recommendation);
  });

  it.each([
    ["unknown decision", { ...recommendation, decision: "REFUND" }],
    ["missing evidence condition", (({ requiresVerifiedEvidence: _, ...rest }) => rest)(recommendation)],
    ["extra authorization", { ...recommendation, authorized: true }],
    ["unknown evidence field", { ...recommendation, evidenceConsidered: ["modelOpinion"] }],
  ])("rejects %s", (_name, value) => {
    expect(() => agentRecommendationSchema.parse(value)).toThrow();
  });
});

describe("decision and experiment records", () => {
  const success = { status: "success", recommendation, meta: { model: "mock-fixture", usage: null } };
  const record = {
    scenarioId: "S2",
    requestId: "REF-101",
    expectedPolicyVerdict: "ESCALATE",
    policyVersion: "REFUND_POLICY_V1",
    mode: "mock",
    provenance: "mock_demonstration",
    timestamp: "2026-10-13T10:00:00.000Z",
    runId: "run-1",
    repeatIndex: 1,
    request,
    agentResults: {
      customerResolution: success,
      policyCompliance: {
        ...success,
        recommendation: { ...recommendation, agent: "policy_compliance", decision: "ESCALATE", requiresVerifiedEvidence: true },
      },
    },
    conflict: {
      type: "decision_mismatch",
      reason: "Agent decisions differ.",
      diagnostics: {
        policyReferences: { customerOnly: ["RPV1-4"], complianceOnly: [], shared: ["RPV1-2"] },
        evidenceInterpretations: {
          customerOnly: [],
          complianceOnly: [],
          shared: ["deliveryIssueReported", "evidenceStatus"],
          requiresVerifiedEvidence: { customer: false, compliance: true, differs: true },
        },
      },
    },
    evaluation: { classifications: ["decision_disagreement"], materialDisagreement: true },
    arbitratorResult: { status: "not_invoked", reason: "fixture" },
    proposedOutcome: null,
    policyVerdict: { decision: "ESCALATE", reasons: ["Evidence missing"], ruleIds: ["RPV1-4"] },
    finalDisposition: "ESCALATE",
    override: { applied: false, explanation: "Policy result is final." },
    timing: { initialAgentsMs: 2, arbitratorMs: null, policyMs: 0, totalMs: 2 },
    usage: {
      callCount: 2,
      attemptCount: 2,
      successfulAttempts: 2,
      failedAttempts: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      models: ["mock-fixture"],
    },
  };

  it("keeps arbitration, verification, and final disposition independently", () => {
    const parsed = decisionRecordSchema.parse(record);
    expect(parsed.arbitratorResult.status).toBe("not_invoked");
    expect(parsed.policyVerdict.decision).toBe("ESCALATE");
    expect(parsed.finalDisposition).toBe("ESCALATE");
  });

  it("validates analysis-ready experiment rows", () => {
    const row = {
      scenarioId: "S2",
      expectedPolicyVerdict: "ESCALATE",
      provenance: "mock_demonstration",
      runId: "run-1",
      repeatIndex: 1,
      agentResponses: record.agentResults,
      conflict: record.conflict,
      evaluation: record.evaluation,
      arbitratorResult: record.arbitratorResult,
      verificationOutcome: record.policyVerdict,
      finalDisposition: "ESCALATE",
      override: record.override,
      latencyMs: 2,
      tokenUsage: record.usage,
    };
    expect(experimentResultSchema.parse(row)).toEqual(row);
  });

  it("rejects mismatched mode provenance", () => {
    expect(() => decisionRecordSchema.parse({ ...record, mode: "live" })).toThrow();
  });
});
