import { describe, expect, it } from "vitest";

import { deriveAgentView } from "../../src/domain/deriveAgentView.js";

const request = {
  requestId: "REF-VIEW",
  daysSincePurchase: 45,
  standardReturnConditionsMet: true,
  refundReason: "Customer reports delivery damage",
  deliveryIssueReported: true,
  qualifyingDeliveryIssue: false,
  evidenceStatus: "verified",
};

describe("deriveAgentView", () => {
  it("projects exact canonical values and exposes no hidden fields", () => {
    expect(deriveAgentView(request, ["requestId", "refundReason", "deliveryIssueReported"])).toEqual({
      requestId: "REF-VIEW",
      refundReason: "Customer reports delivery damage",
      deliveryIssueReported: true,
    });
  });

  it("returns an immutable clone isolated from the canonical input", () => {
    const view = deriveAgentView(request, ["requestId", "refundReason"]);
    expect(Object.isFrozen(view)).toBe(true);
    expect(() => { view.refundReason = "changed"; }).toThrow();
    expect(request.refundReason).toBe("Customer reports delivery damage");
  });

  it.each([
    ["empty fields", []],
    ["duplicate fields", ["requestId", "requestId"]],
    ["unknown field", ["requestId", "expectedPolicyVerdict"]],
  ])("rejects %s", (_name, fields) => {
    expect(() => deriveAgentView(request, fields)).toThrow();
  });

  it("rejects a non-canonical request instead of synthesizing missing values", () => {
    expect(() => deriveAgentView({ requestId: "REF-BROKEN" }, ["requestId"])).toThrow();
  });
});
