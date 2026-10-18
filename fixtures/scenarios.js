function recommendation(agent, decision, reason, policyReferences, evidenceConsidered, options = {}) {
  return {
    kind: "recommendation",
    value: {
      agent,
      decision,
      reason,
      policyReferences,
      evidenceConsidered,
      missingInformation: options.missingInformation ?? [],
      conditions: options.conditions ?? [],
      requiresVerifiedEvidence: options.requiresVerifiedEvidence ?? false,
    },
  };
}

const scenarios = [
  {
    id: "S1",
    description: "Clear in-window eligible request",
    request: { requestId: "REF-S1", daysSincePurchase: 12, standardReturnConditionsMet: true, refundReason: "Changed mind", deliveryIssueReported: false, qualifyingDeliveryIssue: false, evidenceStatus: "missing" },
    expectedPolicyVerdict: "APPROVE",
    mock: {
      customer_resolution: recommendation("customer_resolution", "APPROVE", "The standard return window and conditions are satisfied.", ["RPV1-1"], ["daysSincePurchase", "standardReturnConditionsMet"]),
      policy_compliance: recommendation("policy_compliance", "APPROVE", "The request meets the explicit standard-return rule.", ["RPV1-1"], ["daysSincePurchase", "standardReturnConditionsMet"]),
    },
  },
  {
    id: "S2",
    description: "Late reported delivery issue with missing evidence and divergent recommendations",
    request: { requestId: "REF-101", daysSincePurchase: 32, standardReturnConditionsMet: true, refundReason: "Damaged during delivery", deliveryIssueReported: true, qualifyingDeliveryIssue: null, evidenceStatus: "missing" },
    expectedPolicyVerdict: "ESCALATE",
    mock: {
      customer_resolution: recommendation("customer_resolution", "APPROVE", "A customer-friendly exception could be offered for the reported damage.", ["RPV1-4"], ["deliveryIssueReported", "refundReason"], { conditions: ["Request evidence after approval"] }),
      policy_compliance: recommendation("policy_compliance", "ESCALATE", "Qualification and verified evidence are missing.", ["RPV1-2", "RPV1-3", "RPV1-4", "RPV1-6"], ["deliveryIssueReported", "qualifyingDeliveryIssue", "evidenceStatus"], { missingInformation: ["Qualifying issue determination", "Verified supporting evidence"], requiresVerifiedEvidence: true }),
      arbitrator: recommendation("arbitrator", "ESCALATE", "The unresolved issue and missing evidence require review.", ["RPV1-2", "RPV1-4", "RPV1-6"], ["qualifyingDeliveryIssue", "evidenceStatus"], { missingInformation: ["Verified supporting evidence"], requiresVerifiedEvidence: true }),
    },
  },
  {
    id: "S3",
    description: "Valid verified late delivery exception",
    request: { requestId: "REF-S3", daysSincePurchase: 32, standardReturnConditionsMet: true, refundReason: "Courier damage", deliveryIssueReported: true, qualifyingDeliveryIssue: true, evidenceStatus: "verified" },
    expectedPolicyVerdict: "APPROVE",
    mock: {
      customer_resolution: recommendation("customer_resolution", "APPROVE", "The verified delivery exception qualifies.", ["RPV1-2"], ["qualifyingDeliveryIssue", "evidenceStatus"], { requiresVerifiedEvidence: true }),
      policy_compliance: recommendation("policy_compliance", "APPROVE", "Both late-exception prerequisites are established.", ["RPV1-2"], ["qualifyingDeliveryIssue", "evidenceStatus"], { requiresVerifiedEvidence: true }),
    },
  },
  {
    id: "S4",
    description: "Clearly ineligible late request",
    request: { requestId: "REF-S4", daysSincePurchase: 45, standardReturnConditionsMet: true, refundReason: "Changed mind", deliveryIssueReported: false, qualifyingDeliveryIssue: false, evidenceStatus: "missing" },
    expectedPolicyVerdict: "REJECT",
    mock: {
      customer_resolution: recommendation("customer_resolution", "REJECT", "No qualifying late exception exists.", ["RPV1-2", "RPV1-5"], ["daysSincePurchase", "qualifyingDeliveryIssue"]),
      policy_compliance: recommendation("policy_compliance", "REJECT", "The request is late and explicitly non-qualifying.", ["RPV1-2", "RPV1-5"], ["daysSincePurchase", "qualifyingDeliveryIssue"]),
    },
  },
  {
    id: "S5",
    description: "False consensus approval overridden by policy verification",
    request: { requestId: "REF-S5", daysSincePurchase: 32, standardReturnConditionsMet: true, refundReason: "Damaged during delivery", deliveryIssueReported: true, qualifyingDeliveryIssue: true, evidenceStatus: "missing" },
    expectedPolicyVerdict: "ESCALATE",
    mock: {
      customer_resolution: recommendation("customer_resolution", "APPROVE", "The reported damage warrants an exception.", ["RPV1-2"], ["deliveryIssueReported", "qualifyingDeliveryIssue"]),
      policy_compliance: recommendation("policy_compliance", "APPROVE", "The delivery issue qualifies despite the absent evidence.", ["RPV1-2"], ["deliveryIssueReported", "qualifyingDeliveryIssue"]),
    },
  },
  {
    id: "S6",
    description: "Wrong arbitrator approval overridden by policy verification",
    request: { requestId: "REF-S6", daysSincePurchase: 32, standardReturnConditionsMet: true, refundReason: "Damaged during delivery", deliveryIssueReported: true, qualifyingDeliveryIssue: true, evidenceStatus: "missing" },
    expectedPolicyVerdict: "ESCALATE",
    mock: {
      customer_resolution: recommendation("customer_resolution", "APPROVE", "The qualifying issue supports a customer exception.", ["RPV1-2"], ["qualifyingDeliveryIssue"]),
      policy_compliance: recommendation("policy_compliance", "ESCALATE", "Verified evidence is mandatory for a late exception.", ["RPV1-2", "RPV1-4"], ["qualifyingDeliveryIssue", "evidenceStatus"], { missingInformation: ["Verified supporting evidence"], requiresVerifiedEvidence: true }),
      arbitrator: recommendation("arbitrator", "APPROVE", "The qualifying issue outweighs the missing evidence.", ["RPV1-2"], ["qualifyingDeliveryIssue"], { conditions: ["Collect evidence later"] }),
    },
  },
  {
    id: "S7",
    description: "In-window request with unknown standard conditions",
    request: { requestId: "REF-S7", daysSincePurchase: 25, standardReturnConditionsMet: null, refundReason: "Changed mind", deliveryIssueReported: false, qualifyingDeliveryIssue: false, evidenceStatus: "missing" },
    expectedPolicyVerdict: "ESCALATE",
    mock: {
      customer_resolution: recommendation("customer_resolution", "ESCALATE", "Return-condition facts must be confirmed.", ["RPV1-1", "RPV1-6"], ["daysSincePurchase", "standardReturnConditionsMet"], { missingInformation: ["Standard return conditions"] }),
      policy_compliance: recommendation("policy_compliance", "ESCALATE", "Eligibility cannot be established with unknown conditions.", ["RPV1-1", "RPV1-6"], ["daysSincePurchase", "standardReturnConditionsMet"], { missingInformation: ["Standard return conditions"] }),
    },
  },
  {
    id: "S8",
    description: "Initial agent timeout fails closed",
    request: { requestId: "REF-S8", daysSincePurchase: 32, standardReturnConditionsMet: true, refundReason: "Damaged during delivery", deliveryIssueReported: true, qualifyingDeliveryIssue: null, evidenceStatus: "missing" },
    expectedPolicyVerdict: "ESCALATE",
    mock: {
      customer_resolution: { kind: "failure", category: "timeout", message: "Simulated customer-resolution timeout" },
      policy_compliance: recommendation("policy_compliance", "ESCALATE", "Missing qualification and evidence require escalation.", ["RPV1-2", "RPV1-4", "RPV1-6"], ["qualifyingDeliveryIssue", "evidenceStatus"], { missingInformation: ["Verified supporting evidence"], requiresVerifiedEvidence: true }),
    },
  },
  {
    id: "S9",
    description: "Inclusive day-30 standard-return boundary",
    cohort: "disagreement",
    targetDisagreement: ["APPROVE", "REJECT"],
    request: { requestId: "REF-S9", daysSincePurchase: 30, standardReturnConditionsMet: true, refundReason: "Unopened item returned on the thirtieth day", deliveryIssueReported: false, qualifyingDeliveryIssue: false, evidenceStatus: "missing" },
    expectedPolicyVerdict: "APPROVE",
    mock: {
      customer_resolution: recommendation("customer_resolution", "APPROVE", "Day 30 is included and the standard return conditions are met.", ["RPV1-1"], ["daysSincePurchase", "standardReturnConditionsMet"]),
      policy_compliance: recommendation("policy_compliance", "APPROVE", "The inclusive standard-return rule is satisfied.", ["RPV1-1"], ["daysSincePurchase", "standardReturnConditionsMet"]),
    },
  },
  {
    id: "S10",
    description: "Late qualifying issue with uploaded but unverified evidence",
    cohort: "disagreement",
    targetDisagreement: ["APPROVE", "ESCALATE"],
    request: { requestId: "REF-S10", daysSincePurchase: 31, standardReturnConditionsMet: true, refundReason: "Courier damage report and photos were uploaded and are awaiting verification", deliveryIssueReported: true, qualifyingDeliveryIssue: true, evidenceStatus: "unverified" },
    expectedPolicyVerdict: "ESCALATE",
    mock: {
      customer_resolution: recommendation("customer_resolution", "ESCALATE", "The late exception cannot be approved until the uploaded evidence is verified.", ["RPV1-2", "RPV1-4"], ["daysSincePurchase", "qualifyingDeliveryIssue", "evidenceStatus"], { missingInformation: ["Verified supporting evidence"], requiresVerifiedEvidence: true }),
      policy_compliance: recommendation("policy_compliance", "ESCALATE", "A qualifying late issue exists, but its evidence remains unverified.", ["RPV1-2", "RPV1-4"], ["qualifyingDeliveryIssue", "evidenceStatus"], { missingInformation: ["Verified supporting evidence"], requiresVerifiedEvidence: true }),
    },
  },
  {
    id: "S11",
    description: "Positive customer description while standard-condition inspection is pending",
    cohort: "disagreement",
    targetDisagreement: ["APPROVE", "ESCALATE"],
    request: { requestId: "REF-S11", daysSincePurchase: 25, standardReturnConditionsMet: null, refundReason: "Customer says the item is sealed; warehouse inspection is pending", deliveryIssueReported: false, qualifyingDeliveryIssue: false, evidenceStatus: "missing" },
    expectedPolicyVerdict: "ESCALATE",
    mock: {
      customer_resolution: recommendation("customer_resolution", "ESCALATE", "The customer's description cannot replace the pending standard-condition determination.", ["RPV1-1", "RPV1-6"], ["daysSincePurchase", "standardReturnConditionsMet", "refundReason"], { missingInformation: ["Standard return-condition determination"] }),
      policy_compliance: recommendation("policy_compliance", "ESCALATE", "The in-window request has unknown standard return conditions.", ["RPV1-1", "RPV1-6"], ["daysSincePurchase", "standardReturnConditionsMet"], { missingInformation: ["Standard return-condition determination"] }),
    },
  },
  {
    id: "S12",
    description: "Recent replacement mentioned for an explicitly late non-qualifying purchase",
    cohort: "disagreement",
    targetDisagreement: ["APPROVE", "REJECT"],
    request: { requestId: "REF-S12", daysSincePurchase: 45, standardReturnConditionsMet: true, refundReason: "Original purchase was 45 days ago; a replacement arrived 5 days ago, and the customer changed their mind", deliveryIssueReported: false, qualifyingDeliveryIssue: false, evidenceStatus: "missing" },
    expectedPolicyVerdict: "REJECT",
    mock: {
      customer_resolution: recommendation("customer_resolution", "REJECT", "The trusted request age is over 30 days and no qualifying delivery issue exists.", ["RPV1-2", "RPV1-5"], ["daysSincePurchase", "qualifyingDeliveryIssue"]),
      policy_compliance: recommendation("policy_compliance", "REJECT", "The current policy rejects this explicitly non-qualifying late request.", ["RPV1-2", "RPV1-5"], ["daysSincePurchase", "qualifyingDeliveryIssue"]),
    },
  },
  {
    id: "S13",
    description: "Verified evidence establishes a non-qualifying cause",
    cohort: "disagreement",
    targetDisagreement: ["APPROVE", "REJECT"],
    request: { requestId: "REF-S13", daysSincePurchase: 38, standardReturnConditionsMet: true, refundReason: "Inspection is verified and attributes the damage to customer use rather than delivery", deliveryIssueReported: true, qualifyingDeliveryIssue: false, evidenceStatus: "verified" },
    expectedPolicyVerdict: "REJECT",
    mock: {
      customer_resolution: recommendation("customer_resolution", "REJECT", "Verified evidence does not help because it establishes a non-qualifying cause.", ["RPV1-2", "RPV1-5"], ["qualifyingDeliveryIssue", "evidenceStatus"]),
      policy_compliance: recommendation("policy_compliance", "REJECT", "The late request explicitly lacks a qualifying delivery issue.", ["RPV1-2", "RPV1-5"], ["daysSincePurchase", "qualifyingDeliveryIssue", "evidenceStatus"]),
    },
  },
  {
    id: "S14",
    description: "In-window eligibility with unresolved delivery facts that do not control the standard-return rule",
    cohort: "disagreement",
    targetDisagreement: ["APPROVE", "ESCALATE"],
    request: { requestId: "REF-S14", daysSincePurchase: 30, standardReturnConditionsMet: true, refundReason: "Changed mind; customer also mentioned possible package scuffing that has not been assessed", deliveryIssueReported: true, qualifyingDeliveryIssue: null, evidenceStatus: "unverified" },
    expectedPolicyVerdict: "APPROVE",
    mock: {
      customer_resolution: recommendation("customer_resolution", "APPROVE", "The request independently satisfies the in-window standard-return rule.", ["RPV1-1"], ["daysSincePurchase", "standardReturnConditionsMet"]),
      policy_compliance: recommendation("policy_compliance", "APPROVE", "Unresolved exception facts do not displace established standard eligibility at day 30.", ["RPV1-1"], ["daysSincePurchase", "standardReturnConditionsMet"]),
    },
  },
  {
    id: "S15",
    description: "Persuasive late delivery-damage claim with a non-qualifying determination",
    cohort: "information-view",
    request: { requestId: "REF-S15", daysSincePurchase: 42, standardReturnConditionsMet: true, refundReason: "Customer reports courier damage and supplied a verified inspection document", deliveryIssueReported: true, qualifyingDeliveryIssue: false, evidenceStatus: "verified" },
    views: {
      customer_resolution: ["requestId", "daysSincePurchase", "refundReason", "deliveryIssueReported", "evidenceStatus"],
      policy_compliance: ["requestId", "daysSincePurchase", "qualifyingDeliveryIssue", "evidenceStatus"],
    },
    expectedPolicyVerdict: "REJECT",
    mock: {
      customer_resolution: recommendation("customer_resolution", "REJECT", "The application-controlled determination says the late issue is non-qualifying.", ["RPV1-2", "RPV1-5"], ["daysSincePurchase", "qualifyingDeliveryIssue"]),
      policy_compliance: recommendation("policy_compliance", "REJECT", "A late request with an explicitly non-qualifying issue is rejected.", ["RPV1-2", "RPV1-5"], ["daysSincePurchase", "qualifyingDeliveryIssue", "evidenceStatus"]),
    },
  },
  {
    id: "S16",
    description: "Late qualifying issue with evidence uploaded but not verified",
    cohort: "information-view",
    request: { requestId: "REF-S16", daysSincePurchase: 34, standardReturnConditionsMet: true, refundReason: "Courier damage report and photos were uploaded for review", deliveryIssueReported: true, qualifyingDeliveryIssue: true, evidenceStatus: "unverified" },
    views: {
      customer_resolution: ["requestId", "daysSincePurchase", "refundReason", "deliveryIssueReported", "qualifyingDeliveryIssue"],
      policy_compliance: ["requestId", "daysSincePurchase", "qualifyingDeliveryIssue", "evidenceStatus"],
    },
    expectedPolicyVerdict: "ESCALATE",
    mock: {
      customer_resolution: recommendation("customer_resolution", "ESCALATE", "Verified evidence is not yet established for the late exception.", ["RPV1-2", "RPV1-4"], ["daysSincePurchase", "qualifyingDeliveryIssue", "evidenceStatus"], { requiresVerifiedEvidence: true }),
      policy_compliance: recommendation("policy_compliance", "ESCALATE", "The qualifying issue has only unverified evidence.", ["RPV1-2", "RPV1-4"], ["qualifyingDeliveryIssue", "evidenceStatus"], { requiresVerifiedEvidence: true }),
    },
  },
  {
    id: "S17",
    description: "In-window standard eligibility with distracting unresolved delivery details",
    cohort: "information-view",
    request: { requestId: "REF-S17", daysSincePurchase: 20, standardReturnConditionsMet: true, refundReason: "Changed mind; customer also mentioned possible packaging damage", deliveryIssueReported: true, qualifyingDeliveryIssue: null, evidenceStatus: "unverified" },
    views: {
      customer_resolution: ["requestId", "daysSincePurchase", "refundReason", "deliveryIssueReported", "qualifyingDeliveryIssue", "evidenceStatus"],
      policy_compliance: ["requestId", "daysSincePurchase", "standardReturnConditionsMet"],
    },
    expectedPolicyVerdict: "APPROVE",
    mock: {
      customer_resolution: recommendation("customer_resolution", "APPROVE", "The complete canonical request satisfies the standard return rule.", ["RPV1-1"], ["daysSincePurchase", "standardReturnConditionsMet"]),
      policy_compliance: recommendation("policy_compliance", "APPROVE", "The request is in-window and standard conditions are verified.", ["RPV1-1"], ["daysSincePurchase", "standardReturnConditionsMet"]),
    },
  },
  {
    id: "S18",
    description: "Positive in-window customer claim while standard-condition verification is unknown",
    cohort: "information-view",
    request: { requestId: "REF-S18", daysSincePurchase: 18, standardReturnConditionsMet: null, refundReason: "Customer says the item is unopened and sealed; warehouse inspection is pending", deliveryIssueReported: false, qualifyingDeliveryIssue: false, evidenceStatus: "missing" },
    views: {
      customer_resolution: ["requestId", "daysSincePurchase", "refundReason"],
      policy_compliance: ["requestId", "daysSincePurchase", "standardReturnConditionsMet"],
    },
    expectedPolicyVerdict: "ESCALATE",
    mock: {
      customer_resolution: recommendation("customer_resolution", "ESCALATE", "The standard-condition determination remains unknown.", ["RPV1-1", "RPV1-6"], ["daysSincePurchase", "standardReturnConditionsMet"]),
      policy_compliance: recommendation("policy_compliance", "ESCALATE", "Unknown standard conditions require review.", ["RPV1-1", "RPV1-6"], ["daysSincePurchase", "standardReturnConditionsMet"]),
    },
  },
  {
    id: "S19",
    description: "Old purchase with a recent replacement mentioned and no qualifying issue",
    cohort: "information-view",
    request: { requestId: "REF-S19", daysSincePurchase: 47, standardReturnConditionsMet: true, refundReason: "Original purchase was 47 days ago; a replacement arrived 6 days ago and the customer wants to return it", deliveryIssueReported: false, qualifyingDeliveryIssue: false, evidenceStatus: "missing" },
    views: {
      customer_resolution: ["requestId", "refundReason", "deliveryIssueReported", "evidenceStatus"],
      policy_compliance: ["requestId", "daysSincePurchase", "qualifyingDeliveryIssue", "evidenceStatus"],
    },
    expectedPolicyVerdict: "REJECT",
    mock: {
      customer_resolution: recommendation("customer_resolution", "REJECT", "The trusted request is late and explicitly non-qualifying.", ["RPV1-2", "RPV1-5"], ["daysSincePurchase", "qualifyingDeliveryIssue"]),
      policy_compliance: recommendation("policy_compliance", "REJECT", "No qualifying late exception exists.", ["RPV1-2", "RPV1-5"], ["daysSincePurchase", "qualifyingDeliveryIssue"]),
    },
  },
  {
    id: "S20",
    description: "Late qualifying issue with verified evidence convergence control",
    cohort: "information-view",
    request: { requestId: "REF-S20", daysSincePurchase: 36, standardReturnConditionsMet: true, refundReason: "Courier damage confirmed by the verified carrier inspection", deliveryIssueReported: true, qualifyingDeliveryIssue: true, evidenceStatus: "verified" },
    views: {
      customer_resolution: ["requestId", "daysSincePurchase", "refundReason", "deliveryIssueReported", "evidenceStatus"],
      policy_compliance: ["requestId", "daysSincePurchase", "qualifyingDeliveryIssue", "evidenceStatus"],
    },
    expectedPolicyVerdict: "APPROVE",
    mock: {
      customer_resolution: recommendation("customer_resolution", "APPROVE", "The verified qualifying delivery exception is satisfied.", ["RPV1-2"], ["daysSincePurchase", "qualifyingDeliveryIssue", "evidenceStatus"], { requiresVerifiedEvidence: true }),
      policy_compliance: recommendation("policy_compliance", "APPROVE", "Both late-exception prerequisites are established.", ["RPV1-2"], ["qualifyingDeliveryIssue", "evidenceStatus"], { requiresVerifiedEvidence: true }),
    },
  },
];

export const SCENARIOS = Object.freeze(scenarios);

export function listScenarios({ suite } = {}) {
  if (suite === undefined) return [...SCENARIOS];
  if (!new Set(["disagreement", "information-view"]).has(suite)) throw new RangeError(`Unknown scenario suite: ${suite}`);
  return SCENARIOS.filter((scenario) => scenario.cohort === suite);
}

export function getScenario(id) {
  const scenario = SCENARIOS.find((item) => item.id === id);
  if (!scenario) throw new RangeError(`Unknown scenario: ${id}`);
  return scenario;
}
