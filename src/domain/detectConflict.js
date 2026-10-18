import { agentResultSchema, conflictResultSchema } from "./schemas.js";

function values(result, field) {
  return result?.status === "success" ? [...new Set(result.recommendation[field])].sort() : [];
}

function compareSets(customer, compliance) {
  const customerSet = new Set(customer);
  const complianceSet = new Set(compliance);
  return {
    customerOnly: customer.filter((value) => !complianceSet.has(value)),
    complianceOnly: compliance.filter((value) => !customerSet.has(value)),
    shared: customer.filter((value) => complianceSet.has(value)),
  };
}

export function detectConflict(customerInput, complianceInput) {
  const customerParsed = agentResultSchema.safeParse(customerInput);
  const complianceParsed = agentResultSchema.safeParse(complianceInput);
  const customer = customerParsed.success ? customerParsed.data : null;
  const compliance = complianceParsed.success ? complianceParsed.data : null;
  const customerRequirement = customer?.status === "success" ? customer.recommendation.requiresVerifiedEvidence : null;
  const complianceRequirement = compliance?.status === "success" ? compliance.recommendation.requiresVerifiedEvidence : null;

  const diagnostics = {
    policyReferences: compareSets(values(customer, "policyReferences"), values(compliance, "policyReferences")),
    evidenceInterpretations: {
      ...compareSets(values(customer, "evidenceConsidered"), values(compliance, "evidenceConsidered")),
      requiresVerifiedEvidence: {
        customer: customerRequirement,
        compliance: complianceRequirement,
        differs: customerRequirement !== null && complianceRequirement !== null && customerRequirement !== complianceRequirement,
      },
    },
  };

  const rolesAreValid = customer?.status === "success"
    && customer.recommendation.agent === "customer_resolution"
    && compliance?.status === "success"
    && compliance.recommendation.agent === "policy_compliance";

  if (!rolesAreValid) {
    return conflictResultSchema.parse({ type: "unknown", reason: "One or both initial recommendations are unavailable or invalid.", diagnostics });
  }
  if (customer.recommendation.decision !== compliance.recommendation.decision) {
    return conflictResultSchema.parse({ type: "decision_mismatch", reason: "Agent decisions differ.", diagnostics });
  }
  if (customerRequirement !== complianceRequirement) {
    return conflictResultSchema.parse({ type: "condition_mismatch", reason: "Agents disagree on whether verified evidence is required.", diagnostics });
  }
  return conflictResultSchema.parse({ type: "none", reason: "Agent decisions and material evidence requirements agree.", diagnostics });
}
