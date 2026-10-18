import { policyVerdictSchema, refundRequestSchema } from "./schemas.js";

function verdict(decision, reasons, ruleIds) {
  return policyVerdictSchema.parse({ decision, reasons, ruleIds });
}

export function evaluateRefundPolicy(input) {
  const request = refundRequestSchema.parse(input);

  if (request.daysSincePurchase <= 30) {
    if (request.standardReturnConditionsMet === true) {
      return verdict("APPROVE", ["The request is within 30 days and standard return conditions are met."], ["RPV1-1"]);
    }
    if (request.standardReturnConditionsMet === false) {
      return verdict("REJECT", ["The request is within 30 days but standard return conditions explicitly fail."], ["RPV1-1", "RPV1-5"]);
    }
    return verdict("ESCALATE", ["Standard return conditions are unknown."], ["RPV1-1", "RPV1-6"]);
  }

  if (request.qualifyingDeliveryIssue === true && request.evidenceStatus === "verified") {
    return verdict("APPROVE", ["The late request has a qualifying delivery issue supported by verified evidence."], ["RPV1-2"]);
  }

  if (request.qualifyingDeliveryIssue === false) {
    return verdict("REJECT", ["The late request is explicitly non-qualifying."], ["RPV1-2", "RPV1-5"]);
  }

  if (request.qualifyingDeliveryIssue === true) {
    return verdict("ESCALATE", ["The delivery issue qualifies, but its supporting evidence is not verified."], ["RPV1-2", "RPV1-4"]);
  }

  if (request.deliveryIssueReported && request.qualifyingDeliveryIssue === null) {
    return verdict(
      "ESCALATE",
      ["A delivery issue was reported, but qualification and verified supporting evidence remain unresolved."],
      ["RPV1-3", "RPV1-4", "RPV1-6"],
    );
  }

  return verdict("ESCALATE", ["The late request has incomplete eligibility facts."], ["RPV1-6"]);
}
