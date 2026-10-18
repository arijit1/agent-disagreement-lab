import { describe, expect, it } from "vitest";

import { evaluateRefundPolicy } from "../../src/domain/evaluateRefundPolicy.js";
import { REFUND_POLICY_V1 } from "../../src/domain/refundPolicy.js";

const base = {
  requestId: "REF-POLICY",
  daysSincePurchase: 12,
  standardReturnConditionsMet: true,
  refundReason: "Changed mind",
  deliveryIssueReported: false,
  qualifyingDeliveryIssue: false,
  evidenceStatus: "missing",
};

describe("REFUND_POLICY_V1", () => {
  it("provides one canonical version with stable rule identifiers", () => {
    expect(REFUND_POLICY_V1.version).toBe("REFUND_POLICY_V1");
    expect(REFUND_POLICY_V1.rules.map((rule) => rule.id)).toEqual([
      "RPV1-1",
      "RPV1-2",
      "RPV1-3",
      "RPV1-4",
      "RPV1-5",
      "RPV1-6",
      "RPV1-7",
    ]);
  });
});

describe("evaluateRefundPolicy", () => {
  it.each([
    [0, "APPROVE"],
    [30, "APPROVE"],
  ])("approves day %i when standard return conditions are met", (daysSincePurchase, decision) => {
    expect(evaluateRefundPolicy({ ...base, daysSincePurchase }).decision).toBe(decision);
  });

  it("rejects an in-window request whose standard conditions explicitly fail", () => {
    const verdict = evaluateRefundPolicy({ ...base, standardReturnConditionsMet: false });
    expect(verdict).toMatchObject({ decision: "REJECT", ruleIds: ["RPV1-1", "RPV1-5"] });
  });

  it("escalates an in-window request whose standard conditions are unknown", () => {
    const verdict = evaluateRefundPolicy({ ...base, standardReturnConditionsMet: null });
    expect(verdict).toMatchObject({ decision: "ESCALATE", ruleIds: ["RPV1-1", "RPV1-6"] });
  });

  it("approves a day-31 qualifying delivery exception with verified evidence", () => {
    const verdict = evaluateRefundPolicy({
      ...base,
      daysSincePurchase: 31,
      deliveryIssueReported: true,
      qualifyingDeliveryIssue: true,
      evidenceStatus: "verified",
    });
    expect(verdict).toMatchObject({ decision: "APPROVE", ruleIds: ["RPV1-2"] });
  });

  it.each(["missing", "unverified"])("escalates a qualifying late issue with %s evidence", (evidenceStatus) => {
    const verdict = evaluateRefundPolicy({
      ...base,
      daysSincePurchase: 32,
      deliveryIssueReported: true,
      qualifyingDeliveryIssue: true,
      evidenceStatus,
    });
    expect(verdict).toMatchObject({ decision: "ESCALATE", ruleIds: ["RPV1-2", "RPV1-4"] });
  });

  it("does not upgrade a customer report into verified evidence", () => {
    const verdict = evaluateRefundPolicy({
      ...base,
      daysSincePurchase: 32,
      deliveryIssueReported: true,
      qualifyingDeliveryIssue: null,
      evidenceStatus: "missing",
    });
    expect(verdict).toMatchObject({ decision: "ESCALATE", ruleIds: ["RPV1-3", "RPV1-4", "RPV1-6"] });
  });

  it("rejects a late request when non-qualifying status is established", () => {
    const verdict = evaluateRefundPolicy({ ...base, daysSincePurchase: 45, qualifyingDeliveryIssue: false });
    expect(verdict).toMatchObject({ decision: "REJECT", ruleIds: ["RPV1-2", "RPV1-5"] });
  });

  it("escalates other unclear late requests", () => {
    const verdict = evaluateRefundPolicy({
      ...base,
      daysSincePurchase: 45,
      deliveryIssueReported: false,
      qualifyingDeliveryIssue: null,
    });
    expect(verdict).toMatchObject({ decision: "ESCALATE", ruleIds: ["RPV1-6"] });
  });

  it("rejects untrusted extra policy inputs", () => {
    expect(() => evaluateRefundPolicy({ ...base, modelEvidenceUpgrade: true })).toThrow();
  });
});
