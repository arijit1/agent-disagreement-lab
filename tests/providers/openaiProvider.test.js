import { describe, expect, it, vi } from "vitest";

import { getScenario } from "../../fixtures/scenarios.js";
import { buildAgentMessages } from "../../src/agents/prompts.js";
import { REFUND_POLICY_V1 } from "../../src/domain/refundPolicy.js";
import { createOpenAIProvider } from "../../src/providers/openaiProvider.js";

const scenario = getScenario("S2");
const recommendation = scenario.mock.policy_compliance.value;

function input() {
  return {
    role: "policy_compliance",
    messages: buildAgentMessages({ role: "policy_compliance", request: scenario.request, policy: REFUND_POLICY_V1 }),
  };
}

function clientWith(parse) {
  return { responses: { parse } };
}

describe("OpenAI provider", () => {
  it("uses schema-constrained Responses output and maps usage", async () => {
    const parse = vi.fn().mockResolvedValue({
      status: "completed",
      output_parsed: recommendation,
      usage: { input_tokens: 21, output_tokens: 9, total_tokens: 30 },
    });
    const provider = createOpenAIProvider({ client: clientWith(parse), model: "structured-model", timeoutMs: 1000, maxRetries: 0, maxOutputTokens: 500 });
    const result = await provider.evaluate(input());

    expect(parse).toHaveBeenCalledOnce();
    const [body, options] = parse.mock.calls[0];
    expect(body).toMatchObject({ model: "structured-model", input: input().messages, max_output_tokens: 500 });
    expect(body.text.format).toMatchObject({ type: "json_schema", name: "refund_agent_recommendation", strict: true });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(result).toEqual({
      recommendation,
      meta: {
        model: "structured-model",
        usage: { inputTokens: 21, outputTokens: 9, totalTokens: 30 },
        attemptCount: 1,
        successfulAttempts: 1,
        failedAttempts: 0,
      },
    });
  });

  it("categorizes a refusal without accepting prose", async () => {
    const client = clientWith(vi.fn().mockResolvedValue({
      output_parsed: null,
      output: [{ type: "message", content: [{ type: "refusal", refusal: "Cannot comply" }] }],
      usage: null,
    }));
    await expect(createOpenAIProvider({ client, model: "m" }).evaluate(input())).rejects.toMatchObject({
      category: "refusal",
      diagnostic: { code: "refusal", attemptCount: 1 },
    });
  });

  it("retries incomplete max-token output and retains failed-attempt usage", async () => {
    const parse = vi.fn()
      .mockResolvedValueOnce({
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output_parsed: null,
        usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
      })
      .mockResolvedValueOnce({
        status: "completed",
        output_parsed: recommendation,
        usage: { input_tokens: 11, output_tokens: 9, total_tokens: 20 },
      });
    const result = await createOpenAIProvider({ client: clientWith(parse), model: "m", maxRetries: 1 }).evaluate(input());
    expect(parse).toHaveBeenCalledTimes(2);
    expect(result.meta).toMatchObject({
      attemptCount: 2,
      successfulAttempts: 1,
      failedAttempts: 1,
      usage: { inputTokens: 21, outputTokens: 29, totalTokens: 50 },
    });
  });

  it("distinguishes missing parsed output from schema validation and bounds retries", async () => {
    const missing = vi.fn().mockResolvedValue({ status: "completed", output_parsed: null, usage: null });
    await expect(createOpenAIProvider({ client: clientWith(missing), model: "m", maxRetries: 1 }).evaluate(input())).rejects.toMatchObject({
      category: "invalid_output",
      diagnostic: { code: "missing_parsed_output", attemptCount: 2 },
    });
    expect(missing).toHaveBeenCalledTimes(2);

    const malformed = vi.fn().mockResolvedValue({ status: "completed", output_parsed: { decision: "PAY", raw: "do-not-store" }, usage: null });
    const error = await createOpenAIProvider({ client: clientWith(malformed), model: "m", maxRetries: 0 }).evaluate(input()).catch((value) => value);
    expect(error).toMatchObject({ category: "invalid_output", diagnostic: { code: "schema_validation", attemptCount: 1 } });
    expect(JSON.stringify(error)).not.toContain("do-not-store");
  });

  it("does not retry an agent-role mismatch", async () => {
    const parse = vi.fn().mockResolvedValue({
      status: "completed",
      output_parsed: { ...recommendation, agent: "customer_resolution" },
      usage: null,
    });
    await expect(createOpenAIProvider({ client: clientWith(parse), model: "m", maxRetries: 2 }).evaluate(input())).rejects.toMatchObject({
      diagnostic: { code: "agent_role_mismatch", attemptCount: 1 },
    });
    expect(parse).toHaveBeenCalledOnce();
  });

  it("aborts a call at the configured timeout", async () => {
    const parse = vi.fn((_body, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
    }));
    const provider = createOpenAIProvider({ client: clientWith(parse), model: "m", timeoutMs: 5, maxRetries: 0 });
    await expect(provider.evaluate(input())).rejects.toMatchObject({ category: "timeout", diagnostic: { code: "timeout" } });
  });

  it("bounds transient retries", async () => {
    const parse = vi.fn().mockRejectedValue(Object.assign(new Error("server failed"), { status: 500 }));
    const provider = createOpenAIProvider({ client: clientWith(parse), model: "m", timeoutMs: 1000, maxRetries: 1 });
    await expect(provider.evaluate(input())).rejects.toMatchObject({ category: "provider_error", diagnostic: { code: "provider", attemptCount: 2 } });
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("reports unsupported structured output as configuration error", async () => {
    const error = Object.assign(new Error("Structured outputs are not supported by this model"), { status: 400 });
    const parse = vi.fn().mockRejectedValue(error);
    const provider = createOpenAIProvider({ client: clientWith(parse), model: "unsupported", maxRetries: 2 });
    await expect(provider.evaluate(input())).rejects.toMatchObject({ category: "configuration_error", diagnostic: { code: "configuration", attemptCount: 1 } });
    expect(parse).toHaveBeenCalledOnce();
  });

  it("recognizes SDK json_schema capability errors as configuration errors", async () => {
    const error = Object.assign(new Error("Invalid parameter: text.format json_schema is not supported with this model"), { status: 400 });
    const provider = createOpenAIProvider({ client: clientWith(vi.fn().mockRejectedValue(error)), model: "unsupported", maxRetries: 0 });
    await expect(provider.evaluate(input())).rejects.toMatchObject({ category: "configuration_error" });
  });
});
