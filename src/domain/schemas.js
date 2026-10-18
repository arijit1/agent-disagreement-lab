import { z } from "zod";

export const decisionSchema = z.enum(["APPROVE", "REJECT", "ESCALATE"]);
export const evidenceStatusSchema = z.enum(["verified", "missing", "unverified"]);
export const agentRoleSchema = z.enum(["customer_resolution", "policy_compliance", "arbitrator"]);

export const refundRequestSchema = z.strictObject({
  requestId: z.string().trim().min(1),
  daysSincePurchase: z.number().int().nonnegative(),
  standardReturnConditionsMet: z.boolean().nullable(),
  refundReason: z.string(),
  deliveryIssueReported: z.boolean(),
  qualifyingDeliveryIssue: z.boolean().nullable(),
  evidenceStatus: evidenceStatusSchema,
});

export const requestFieldSchema = z.enum([
  "requestId",
  "daysSincePurchase",
  "standardReturnConditionsMet",
  "refundReason",
  "deliveryIssueReported",
  "qualifyingDeliveryIssue",
  "evidenceStatus",
]);

export const requestViewSchema = refundRequestSchema.partial().refine(
  (view) => Object.keys(view).length > 0,
  { message: "A request view must contain at least one canonical field." },
);

export const viewManifestSchema = z.strictObject({
  visibleFields: z.array(requestFieldSchema).min(1).refine(
    (fields) => new Set(fields).size === fields.length,
    { message: "Visible request fields must be unique." },
  ),
  facts: requestViewSchema,
}).superRefine((manifest, context) => {
  const fields = [...manifest.visibleFields].sort();
  const factFields = Object.keys(manifest.facts).sort();
  if (fields.length !== factFields.length || fields.some((field, index) => field !== factFields[index])) {
    context.addIssue({ code: "custom", path: ["facts"], message: "View facts must exactly match visibleFields." });
  }
});

export const agentViewsSchema = z.strictObject({
  customerResolution: viewManifestSchema,
  policyCompliance: viewManifestSchema,
});

export const experimentArmSchema = z.enum(["asymmetric", "full_information"]);
export const pairAttributionSchema = z.enum([
  "access_associated",
  "persistent_across_arms",
  "control_only",
  "no_decision_disagreement",
  "unclassifiable_operational_failure",
]);

export const providerDiagnosticCodeSchema = z.enum([
  "incomplete_max_output_tokens",
  "missing_parsed_output",
  "schema_validation",
  "agent_role_mismatch",
  "refusal",
  "timeout",
  "configuration",
  "provider",
]);

export const experimentContextSchema = z.strictObject({
  suite: z.literal("information-view"),
  arm: experimentArmSchema,
  pairId: z.string().trim().min(1),
  executionOrder: z.number().int().min(1).max(2),
  agentViews: agentViewsSchema,
  pairAttribution: pairAttributionSchema.nullable(),
});

export const agentRecommendationSchema = z.strictObject({
  agent: agentRoleSchema,
  decision: decisionSchema,
  reason: z.string().trim().min(1),
  policyReferences: z.array(z.string().trim().min(1)),
  evidenceConsidered: z.array(requestFieldSchema),
  missingInformation: z.array(z.string()),
  conditions: z.array(z.string()),
  requiresVerifiedEvidence: z.boolean(),
});

export const usageSchema = z.strictObject({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
});

export const providerMetaSchema = z.strictObject({
  model: z.string().trim().min(1),
  usage: usageSchema.nullable(),
  attemptCount: z.number().int().positive().optional(),
  successfulAttempts: z.number().int().nonnegative().optional(),
  failedAttempts: z.number().int().nonnegative().optional(),
});

export const providerFailureMetaSchema = z.strictObject({
  model: z.string().trim().min(1).nullable(),
  usage: usageSchema.nullable(),
  attemptCount: z.number().int().positive(),
  successfulAttempts: z.literal(0),
  failedAttempts: z.number().int().positive(),
});

export const providerDiagnosticSchema = z.strictObject({
  code: providerDiagnosticCodeSchema,
  attemptCount: z.number().int().positive(),
  responseStatus: z.string().nullable(),
  issuePaths: z.array(z.string()),
});

export const providerResponseSchema = z.strictObject({
  recommendation: agentRecommendationSchema,
  meta: providerMetaSchema,
});

export const agentSuccessSchema = z.strictObject({
  status: z.literal("success"),
  recommendation: agentRecommendationSchema,
  meta: providerMetaSchema,
});

export const agentFailureSchema = z.strictObject({
  status: z.literal("failure"),
  agent: agentRoleSchema,
  category: z.enum(["timeout", "invalid_output", "refusal", "provider_error", "configuration_error"]),
  message: z.string().trim().min(1),
  diagnostic: providerDiagnosticSchema,
  meta: providerFailureMetaSchema,
});

export const agentResultSchema = z.discriminatedUnion("status", [agentSuccessSchema, agentFailureSchema]);

const stringSetDiagnosticsSchema = z.strictObject({
  customerOnly: z.array(z.string()),
  complianceOnly: z.array(z.string()),
  shared: z.array(z.string()),
});

export const conflictResultSchema = z.strictObject({
  type: z.enum(["decision_mismatch", "condition_mismatch", "none", "unknown"]),
  reason: z.string().trim().min(1),
  diagnostics: z.strictObject({
    policyReferences: stringSetDiagnosticsSchema,
    evidenceInterpretations: stringSetDiagnosticsSchema.extend({
      requiresVerifiedEvidence: z.strictObject({
        customer: z.boolean().nullable(),
        compliance: z.boolean().nullable(),
        differs: z.boolean(),
      }),
    }),
  }),
});

export const evaluationCategorySchema = z.enum([
  "decision_disagreement",
  "condition_disagreement",
  "incorrect_consensus",
  "operational_failure",
  "correct_consensus",
]);

export const evaluationClassificationSchema = z.strictObject({
  classifications: z.array(evaluationCategorySchema).min(1),
  materialDisagreement: z.boolean(),
});

export const policyVerdictSchema = z.strictObject({
  decision: decisionSchema,
  reasons: z.array(z.string().trim().min(1)).min(1),
  ruleIds: z.array(z.string().trim().min(1)).min(1),
});

export const arbitratorResultSchema = z.union([
  agentResultSchema,
  z.strictObject({
    status: z.literal("not_invoked"),
    reason: z.string().trim().min(1),
  }),
]);

export const aggregateUsageSchema = z.strictObject({
  callCount: z.number().int().nonnegative(),
  attemptCount: z.number().int().nonnegative(),
  successfulAttempts: z.number().int().nonnegative(),
  failedAttempts: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  models: z.array(z.string().trim().min(1)),
});

export const decisionRecordSchema = z.strictObject({
  scenarioId: z.string().trim().min(1),
  requestId: z.string().trim().min(1),
  expectedPolicyVerdict: decisionSchema,
  policyVersion: z.string().trim().min(1),
  mode: z.enum(["mock", "live"]),
  provenance: z.enum(["mock_demonstration", "live_evaluation"]),
  timestamp: z.iso.datetime({ offset: true }),
  runId: z.string().trim().min(1),
  repeatIndex: z.number().int().positive(),
  experiment: experimentContextSchema.nullable().optional(),
  request: refundRequestSchema,
  agentResults: z.strictObject({
    customerResolution: agentResultSchema,
    policyCompliance: agentResultSchema,
  }),
  conflict: conflictResultSchema,
  evaluation: evaluationClassificationSchema,
  arbitratorResult: arbitratorResultSchema,
  proposedOutcome: decisionSchema.nullable(),
  policyVerdict: policyVerdictSchema,
  finalDisposition: decisionSchema,
  override: z.strictObject({
    applied: z.boolean(),
    explanation: z.string().trim().min(1),
  }),
  timing: z.strictObject({
    initialAgentsMs: z.number().nonnegative(),
    arbitratorMs: z.number().nonnegative().nullable(),
    policyMs: z.number().nonnegative(),
    totalMs: z.number().nonnegative(),
  }),
  usage: aggregateUsageSchema,
}).superRefine((record, context) => {
  const expected = record.mode === "mock" ? "mock_demonstration" : "live_evaluation";
  if (record.provenance !== expected) {
    context.addIssue({
      code: "custom",
      path: ["provenance"],
      message: `Mode ${record.mode} requires provenance ${expected}`,
    });
  }
});

export const experimentResultSchema = z.strictObject({
  scenarioId: z.string().trim().min(1),
  expectedPolicyVerdict: decisionSchema,
  provenance: z.enum(["mock_demonstration", "live_evaluation"]),
  runId: z.string().trim().min(1),
  repeatIndex: z.number().int().positive(),
  experiment: experimentContextSchema.nullable().optional(),
  agentResponses: z.strictObject({
    customerResolution: agentResultSchema,
    policyCompliance: agentResultSchema,
  }),
  conflict: conflictResultSchema,
  evaluation: evaluationClassificationSchema,
  arbitratorResult: arbitratorResultSchema,
  verificationOutcome: policyVerdictSchema,
  finalDisposition: decisionSchema,
  override: z.strictObject({
    applied: z.boolean(),
    explanation: z.string().trim().min(1),
  }),
  latencyMs: z.number().nonnegative(),
  tokenUsage: aggregateUsageSchema,
});
