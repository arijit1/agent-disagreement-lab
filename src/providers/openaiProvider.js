import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import { agentRecommendationSchema } from "../domain/schemas.js";
import { ProviderError } from "./providerError.js";

function hasRefusal(response) {
  return response?.output?.some((item) => item?.content?.some((content) => content?.type === "refusal"));
}

function isTransient(error) {
  return error?.status === 408
    || error?.status === 409
    || error?.status === 429
    || error?.status >= 500
    || new Set(["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"]).has(error?.code);
}

function categorizeError(error, signal) {
  if (error instanceof ProviderError) return error;
  if (signal.aborted || error?.name === "AbortError") {
    return new ProviderError("timeout", "OpenAI evaluation timed out.", { diagnosticCode: "timeout" });
  }
  const message = String(error?.message ?? "").toLowerCase();
  const structuredOutputError = ["structured output", "response_format", "json_schema", "text.format"]
    .some((fragment) => message.includes(fragment));
  if (error?.status === 401 || error?.status === 403 || (error?.status === 400 && structuredOutputError)) {
    return new ProviderError("configuration_error", "The configured model or credentials cannot provide structured output.", { diagnosticCode: "configuration" });
  }
  if (error?.name === "ZodError") {
    return new ProviderError("invalid_output", "The model returned invalid structured output.", { diagnosticCode: "schema_validation" });
  }
  return new ProviderError("provider_error", "OpenAI evaluation failed.", { diagnosticCode: "provider" });
}

function normalizeUsage(usage) {
  return usage
    ? { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, totalTokens: usage.total_tokens }
    : null;
}

function addUsage(total, usage) {
  if (!usage) return total;
  const base = total ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  return {
    inputTokens: base.inputTokens + usage.inputTokens,
    outputTokens: base.outputTokens + usage.outputTokens,
    totalTokens: base.totalTokens + usage.totalTokens,
  };
}

const retryableDiagnostics = new Set(["incomplete_max_output_tokens", "missing_parsed_output", "schema_validation", "timeout"]);

export function createOpenAIProvider({
  client,
  apiKey,
  model,
  timeoutMs = 30000,
  maxRetries = 1,
  maxOutputTokens = 1600,
} = {}) {
  if (!model?.trim()) throw new ProviderError("configuration_error", "An OpenAI model is required.");
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new ProviderError("configuration_error", "timeoutMs must be positive.");
  if (!Number.isInteger(maxRetries) || maxRetries < 0) throw new ProviderError("configuration_error", "maxRetries must be nonnegative.");
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens <= 0) throw new ProviderError("configuration_error", "maxOutputTokens must be positive.");
  const sdk = client ?? new OpenAI({ apiKey, maxRetries: 0 });

  return Object.freeze({
    async evaluate({ role, messages }) {
      let accumulatedUsage = null;
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await sdk.responses.parse(
            {
              model,
              input: messages,
              max_output_tokens: maxOutputTokens,
              text: { format: zodTextFormat(agentRecommendationSchema, "refund_agent_recommendation") },
            },
            { signal: controller.signal },
          );
          accumulatedUsage = addUsage(accumulatedUsage, normalizeUsage(response.usage));
          if (hasRefusal(response)) {
            throw new ProviderError("refusal", "The model refused the structured evaluation.", {
              diagnosticCode: "refusal",
              responseStatus: response.status ?? null,
            });
          }
          if (response.status === "incomplete" && response.incomplete_details?.reason === "max_output_tokens") {
            throw new ProviderError("invalid_output", "The model response ended before structured output completed.", {
              diagnosticCode: "incomplete_max_output_tokens",
              responseStatus: response.status,
            });
          }
          if (response.output_parsed === null || response.output_parsed === undefined) {
            throw new ProviderError("invalid_output", "The model returned no parsed structured output.", {
              diagnosticCode: "missing_parsed_output",
              responseStatus: response.status ?? null,
            });
          }
          const parsed = agentRecommendationSchema.safeParse(response.output_parsed);
          if (!parsed.success) {
            throw new ProviderError("invalid_output", "The model returned invalid structured output.", {
              diagnosticCode: "schema_validation",
              responseStatus: response.status ?? null,
              issuePaths: parsed.error.issues.map((issue) => `${issue.path.join(".") || "$"}:${issue.code}`),
            });
          }
          if (parsed.data.agent !== role) {
            throw new ProviderError("invalid_output", "The model returned a recommendation for the wrong agent role.", {
              diagnosticCode: "agent_role_mismatch",
              responseStatus: response.status ?? null,
            });
          }
          return {
            recommendation: parsed.data,
            meta: {
              model,
              usage: accumulatedUsage,
              attemptCount: attempt + 1,
              successfulAttempts: 1,
              failedAttempts: attempt,
            },
          };
        } catch (error) {
          const categorized = categorizeError(error, controller.signal);
          const retryable = retryableDiagnostics.has(categorized.diagnostic.code) || isTransient(error);
          if (attempt < maxRetries && retryable && categorized.diagnostic.code !== "agent_role_mismatch") continue;
          throw new ProviderError(categorized.category, categorized.message, {
            diagnosticCode: categorized.diagnostic.code,
            attemptCount: attempt + 1,
            responseStatus: categorized.diagnostic.responseStatus,
            issuePaths: categorized.diagnostic.issuePaths,
            usage: accumulatedUsage,
            model,
            successfulAttempts: 0,
            failedAttempts: attempt + 1,
          });
        } finally {
          clearTimeout(timeout);
        }
      }
      throw new ProviderError("provider_error", "OpenAI evaluation failed.", { diagnosticCode: "provider", model });
    },
  });
}
