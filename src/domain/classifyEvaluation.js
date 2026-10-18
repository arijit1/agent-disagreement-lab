import { evaluationClassificationSchema } from "./schemas.js";

export function classifyEvaluation({ agentResults, conflict, policyVerdict }) {
  const { customerResolution, policyCompliance } = agentResults;
  if (customerResolution.status !== "success" || policyCompliance.status !== "success") {
    return evaluationClassificationSchema.parse({ classifications: ["operational_failure"], materialDisagreement: false });
  }
  if (conflict.type === "decision_mismatch") {
    return evaluationClassificationSchema.parse({ classifications: ["decision_disagreement"], materialDisagreement: true });
  }
  const incorrectConsensus = customerResolution.recommendation.decision !== policyVerdict.decision;
  if (conflict.type === "condition_mismatch") {
    return evaluationClassificationSchema.parse({
      classifications: ["condition_disagreement", ...(incorrectConsensus ? ["incorrect_consensus"] : [])],
      materialDisagreement: false,
    });
  }
  if (incorrectConsensus) {
    return evaluationClassificationSchema.parse({ classifications: ["incorrect_consensus"], materialDisagreement: false });
  }
  return evaluationClassificationSchema.parse({ classifications: ["correct_consensus"], materialDisagreement: false });
}
