import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/infrastructure/config.js";

describe("loadConfig", () => {
  it("uses deterministic mock defaults", () => {
    expect(loadConfig({ env: {}, args: [] })).toEqual({
      mode: "mock",
      scenarioId: null,
      suite: null,
      auditOutputPath: "outputs/decisions.jsonl",
      resultsOutputPath: "outputs/experiment-results.json",
      reportOutputPath: "outputs/experiment-report.json",
      resultsFormat: "json",
      runs: 1,
      openai: { apiKey: null, model: null, timeoutMs: 30000, maxRetries: 1, maxOutputTokens: 1600 },
    });
  });

  it("selects the disagreement suite", () => {
    expect(loadConfig({ env: {}, args: ["--suite", "disagreement", "--runs", "5"] })).toMatchObject({
      scenarioId: null,
      suite: "disagreement",
      runs: 5,
    });
  });

  it("uses dedicated non-overwriting paths for the information-view suite", () => {
    expect(loadConfig({ env: {}, args: ["--suite", "information-view", "--runs", "3"] })).toMatchObject({
      suite: "information-view", runs: 3,
      auditOutputPath: "outputs/mock-information-view-audit.jsonl",
      resultsOutputPath: "outputs/mock-information-view-results.json",
      reportOutputPath: "outputs/mock-information-view-report.json",
      handoffMarkdownPath: "outputs/article-agent-handoff.md",
      handoffJsonPath: "outputs/article-agent-handoff.json",
    });
  });

  it("loads explicit live settings and repeated-run exports", () => {
    const config = loadConfig({
      env: {
        OPENAI_API_KEY: "test-key",
        OPENAI_MODEL: "structured-model",
        OPENAI_TIMEOUT_MS: "12000",
        OPENAI_MAX_RETRIES: "2",
        OPENAI_MAX_OUTPUT_TOKENS: "500",
      },
      args: ["--mode", "live", "--scenario", "S2", "--runs", "5", "--output", "tmp/audit.jsonl", "--results", "tmp/live.csv", "--report", "tmp/report.json", "--format", "csv"],
    });
    expect(config).toMatchObject({
      mode: "live",
      scenarioId: "S2",
      runs: 5,
      auditOutputPath: "tmp/audit.jsonl",
      resultsOutputPath: "tmp/live.csv",
      reportOutputPath: "tmp/report.json",
      resultsFormat: "csv",
      openai: { apiKey: "test-key", model: "structured-model", timeoutMs: 12000, maxRetries: 2, maxOutputTokens: 500 },
    });
  });

  it.each([
    ["missing API key", { OPENAI_MODEL: "m" }, ["--mode", "live"]],
    ["missing model", { OPENAI_API_KEY: "k" }, ["--mode", "live"]],
    ["invalid mode", {}, ["--mode", "production"]],
    ["invalid format", {}, ["--format", "xlsx"]],
    ["zero runs", {}, ["--runs", "0"]],
    ["fractional runs", {}, ["--runs", "1.5"]],
    ["unknown option", {}, ["--wat", "x"]],
    ["unknown suite", {}, ["--suite", "everything"]],
    ["scenario and suite together", {}, ["--scenario", "S9", "--suite", "disagreement"]],
  ])("rejects %s", (_name, env, args) => {
    expect(() => loadConfig({ env, args })).toThrow();
  });
});
