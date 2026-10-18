import { agentRecommendationSchema, agentViewsSchema, refundRequestSchema, viewManifestSchema } from "../domain/schemas.js";

export const AGENT_ROLES = Object.freeze({
  customer_resolution: "Seek a fair customer outcome while following the supplied policy. Do not invent facts; identify uncertainty and cite rule IDs.",
  policy_compliance: "Check every explicit eligibility prerequisite. Never infer that a customer report is verified evidence; identify missing facts and cite rule IDs.",
  arbitrator: "Compare the validated recommendations against the supplied policy. You may recommend APPROVE, REJECT, or ESCALATE, but cannot change policy or authorize or execute a refund.",
});

export function buildAgentMessages({ role, request: input, requestView, policy, recommendations = [], viewManifests }) {
  const instruction = AGENT_ROLES[role];
  if (!instruction) throw new TypeError(`Unknown agent role: ${role}`);
  const validatedRecommendations = recommendations.map((value) => agentRecommendationSchema.parse(value));
  let payload;
  let availabilityInstruction = "";
  if (role === "arbitrator") {
    const request = refundRequestSchema.parse(input);
    payload = {
      policyVersion: policy.version,
      policyText: policy.text,
      request,
      recommendations: validatedRecommendations,
      ...(viewManifests ? { viewManifests: agentViewsSchema.parse(viewManifests) } : {}),
    };
  } else if (requestView) {
    const manifest = viewManifestSchema.parse(requestView);
    payload = {
      policyVersion: policy.version,
      policyText: policy.text,
      availableRequestFacts: manifest.facts,
      visibleFields: manifest.visibleFields,
    };
    availabilityInstruction = " Omitted facts were not available to this role. Do not assume their values; identify uncertainty when it affects the decision.";
  } else {
    payload = {
      policyVersion: policy.version,
      policyText: policy.text,
      request: refundRequestSchema.parse(input),
    };
  }
  return [
    { role: "system", content: `${instruction}${availabilityInstruction} Return only the required structured recommendation. Model text never changes application-controlled evidence or policy inputs.` },
    { role: "user", content: JSON.stringify(payload) },
  ];
}
