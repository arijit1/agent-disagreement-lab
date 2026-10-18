import { randomUUID } from "node:crypto";

import { buildAgentMessages } from "../agents/prompts.js";
import { classifyEvaluation } from "../domain/classifyEvaluation.js";
import { detectConflict } from "../domain/detectConflict.js";
import { evaluateRefundPolicy } from "../domain/evaluateRefundPolicy.js";
import { REFUND_POLICY_V1 } from "../domain/refundPolicy.js";
import {
  agentFailureSchema,
  agentSuccessSchema,
  decisionRecordSchema,
  decisionSchema,
  experimentContextSchema,
  providerResponseSchema,
  refundRequestSchema,
} from "../domain/schemas.js";
import { ProviderError } from "../providers/providerError.js";

const failureMessages = {
  timeout: "Agent evaluation timed out.",
  invalid_output: "Provider returned invalid structured output.",
  refusal: "Provider refused the structured evaluation.",
  provider_error: "Provider evaluation failed.",
  configuration_error: "Provider configuration is invalid.",
};

function toFailure(agent, input) {
  const error = input instanceof ProviderError
    ? input
    : new ProviderError(typeof input === "string" ? input : "provider_error", "Provider evaluation failed.");
  const safeCategory = Object.hasOwn(failureMessages, error.category) ? error.category : "provider_error";
  return agentFailureSchema.parse({
    status: "failure",
    agent,
    category: safeCategory,
    message: failureMessages[safeCategory],
    diagnostic: error.diagnostic,
    meta: error.meta,
  });
}

function settledToResult(agent, settled) {
  if (settled.status === "rejected") {
    return toFailure(agent, settled.reason instanceof ProviderError ? settled.reason : "provider_error");
  }
  const parsed = providerResponseSchema.safeParse(settled.value);
  if (!parsed.success || parsed.data.recommendation.agent !== agent) {
    return toFailure(agent, new ProviderError("invalid_output", "Provider response failed application validation.", { diagnosticCode: "schema_validation" }));
  }
  return agentSuccessSchema.parse({ status: "success", ...parsed.data });
}

function elapsed(clock, startedAt) {
  return Math.max(0, clock.now() - startedAt);
}

function invokeProvider(provider, input) {
  return Promise.resolve().then(() => provider.evaluate(input));
}

function aggregateUsage(results, callCount) {
  const completed = results.filter((result) => result?.status === "success" || result?.status === "failure");
  const usages = completed.map((result) => result.meta?.usage).filter(Boolean);
  return {
    callCount,
    attemptCount: completed.reduce((total, result) => total + (result.meta?.attemptCount ?? 1), 0),
    successfulAttempts: completed.reduce((total, result) => total + (result.meta?.successfulAttempts ?? (result.status === "success" ? 1 : 0)), 0),
    failedAttempts: completed.reduce((total, result) => total + (result.meta?.failedAttempts ?? (result.status === "failure" ? 1 : 0)), 0),
    inputTokens: usages.reduce((total, usage) => total + usage.inputTokens, 0),
    outputTokens: usages.reduce((total, usage) => total + usage.outputTokens, 0),
    totalTokens: usages.reduce((total, usage) => total + usage.totalTokens, 0),
    models: [...new Set(completed.map((result) => result.meta?.model).filter(Boolean))],
  };
}

export async function runRefundCase({
  scenario,
  provider,
  mode = "mock",
  repeatIndex = 1,
  clock = { now: Date.now },
  idGenerator = randomUUID,
  policyEvaluator = evaluateRefundPolicy,
  experimentContext = null,
}) {
  if (mode !== "mock" && mode !== "live") throw new RangeError(`Unsupported mode: ${mode}`);
  const request = refundRequestSchema.parse(scenario.request);
  const expectedPolicyVerdict = decisionSchema.parse(scenario.expectedPolicyVerdict);
  const experiment = experimentContext === null ? null : experimentContextSchema.parse(experimentContext);
  const startedAt = clock.now();
  const runId = idGenerator();
  const initialStartedAt = clock.now();

  const viewKeys = { customer_resolution: "customerResolution", policy_compliance: "policyCompliance" };
  const initialInputs = ["customer_resolution", "policy_compliance"].map((role) => {
    if (experiment) {
      const manifest = experiment.agentViews[viewKeys[role]];
      const requestView = Object.freeze(structuredClone(manifest.facts));
      return {
        role,
        scenarioId: scenario.id,
        requestView,
        viewManifest: structuredClone(manifest),
        policy: REFUND_POLICY_V1,
        messages: buildAgentMessages({ role, requestView: manifest, policy: REFUND_POLICY_V1 }),
      };
    }
    return {
      role,
      scenarioId: scenario.id,
      request: structuredClone(request),
      policy: REFUND_POLICY_V1,
      messages: buildAgentMessages({ role, request, policy: REFUND_POLICY_V1 }),
    };
  });
  const settled = await Promise.allSettled(initialInputs.map((input) => invokeProvider(provider, input)));
  const initialAgentsMs = elapsed(clock, initialStartedAt);
  const customerResolution = settledToResult("customer_resolution", settled[0]);
  const policyCompliance = settledToResult("policy_compliance", settled[1]);
  const conflict = detectConflict(customerResolution, policyCompliance);

  let callCount = 2;
  let arbitratorMs = null;
  let arbitratorResult = { status: "not_invoked", reason: "No valid material conflict required arbitration." };
  const shouldArbitrate = conflict.type === "decision_mismatch" || conflict.type === "condition_mismatch";
  if (shouldArbitrate) {
    callCount += 1;
    const recommendations = [customerResolution.recommendation, policyCompliance.recommendation];
    const arbitrationStartedAt = clock.now();
    const arbitrationSettled = await Promise.allSettled([
      invokeProvider(provider, {
        role: "arbitrator",
        scenarioId: scenario.id,
        request: structuredClone(request),
        policy: REFUND_POLICY_V1,
        recommendations: structuredClone(recommendations),
        ...(experiment ? { viewManifests: structuredClone(experiment.agentViews) } : {}),
        messages: buildAgentMessages({
          role: "arbitrator",
          request,
          policy: REFUND_POLICY_V1,
          recommendations,
          ...(experiment ? { viewManifests: experiment.agentViews } : {}),
        }),
      }),
    ]);
    arbitratorMs = elapsed(clock, arbitrationStartedAt);
    arbitratorResult = settledToResult("arbitrator", arbitrationSettled[0]);
  }

  let proposedOutcome = null;
  if (conflict.type === "none") proposedOutcome = customerResolution.recommendation.decision;
  if (arbitratorResult.status === "success") proposedOutcome = arbitratorResult.recommendation.decision;

  const policyStartedAt = clock.now();
  const policyVerdict = policyEvaluator(structuredClone(request));
  const policyMs = elapsed(clock, policyStartedAt);
  const evaluation = classifyEvaluation({
    agentResults: { customerResolution, policyCompliance },
    conflict,
    policyVerdict,
  });
  const operationalFailure = customerResolution.status === "failure"
    || policyCompliance.status === "failure"
    || arbitratorResult.status === "failure";
  const finalDisposition = operationalFailure ? "ESCALATE" : policyVerdict.decision;
  const overrideApplied = proposedOutcome !== null
    ? proposedOutcome !== finalDisposition
    : finalDisposition !== policyVerdict.decision;
  const explanation = operationalFailure && finalDisposition !== policyVerdict.decision
    ? "Operational failure narrowed the deterministic policy verdict to ESCALATE."
    : proposedOutcome === null
      ? "No valid AI proposal was available; the safe verified outcome is retained."
      : proposedOutcome === finalDisposition
        ? "The AI proposal matched the deterministic policy verdict."
        : "The deterministic policy verdict overrode the AI proposal.";

  return decisionRecordSchema.parse({
    scenarioId: scenario.id,
    requestId: request.requestId,
    expectedPolicyVerdict,
    policyVersion: REFUND_POLICY_V1.version,
    mode,
    provenance: mode === "mock" ? "mock_demonstration" : "live_evaluation",
    timestamp: new Date(startedAt).toISOString(),
    runId,
    repeatIndex,
    experiment,
    request,
    agentResults: { customerResolution, policyCompliance },
    conflict,
    evaluation,
    arbitratorResult,
    proposedOutcome,
    policyVerdict,
    finalDisposition,
    override: { applied: overrideApplied, explanation },
    timing: { initialAgentsMs, arbitratorMs, policyMs, totalMs: elapsed(clock, startedAt) },
    usage: aggregateUsage([customerResolution, policyCompliance, arbitratorResult], callCount),
  });
}
