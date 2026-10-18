import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { main, runCli } from "../../src/cli/main.js";
import { createMockProvider } from "../../src/providers/mockProvider.js";

const cleanup = [];
afterEach(async () => Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

async function paths(extension = "json") {
  const root = await mkdtemp(join(tmpdir(), "refund-cli-"));
  cleanup.push(root);
  return { root, audit: join(root, "audit.jsonl"), results: join(root, `results.${extension}`), report: join(root, "report.json") };
}

function capture() {
  let text = "";
  return { stream: { write(value) { text += value; } }, read: () => text };
}

describe("refund decision CLI", () => {
  it("runs all fourteen scenarios in default deterministic mock mode", async () => {
    const output = capture();
    const files = await paths();
    const records = await runCli({
      args: ["--output", files.audit, "--results", files.results, "--report", files.report],
      env: {},
      stdout: output.stream,
    });
    expect(records).toHaveLength(14);
    expect(records.every((record) => record.provenance === "mock_demonstration")).toBe(true);
    expect(output.read()).toContain("MOCK DEMONSTRATION — illustrative fixture, not a live model result");
    expect((await readFile(files.audit, "utf8")).trim().split("\n")).toHaveLength(14);
    expect(JSON.parse(await readFile(files.results, "utf8"))).toHaveLength(14);
    expect(JSON.parse(await readFile(files.report, "utf8"))).toMatchObject({ totalRuns: 14, provenance: "mock_demonstration" });
  });

  it("runs only the disagreement suite for every requested live repeat", async () => {
    const files = await paths();
    const records = await runCli({
      args: ["--mode", "live", "--suite", "disagreement", "--runs", "2", "--output", files.audit, "--results", files.results],
      env: { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "test-model" },
      stdout: { write() {} },
      providerFactory: ({ scenario }) => createMockProvider(scenario),
    });
    expect(records).toHaveLength(12);
    expect(records.map((record) => record.scenarioId)).toEqual([
      "S9", "S10", "S11", "S12", "S13", "S14",
      "S9", "S10", "S11", "S12", "S13", "S14",
    ]);
    expect(records.every((record) => record.provenance === "live_evaluation")).toBe(true);
  });

  it("runs paired information-view arms and writes both handoffs", async () => {
    const files = await paths();
    const markdown = join(files.root, "handoff.md");
    const json = join(files.root, "handoff.json");
    const records = await runCli({
      args: ["--suite", "information-view", "--runs", "3", "--output", files.audit, "--results", files.results, "--report", files.report, "--handoff-md", markdown, "--handoff-json", json],
      env: {}, stdout: { write() {} }, providerFactory: ({ scenario }) => createMockProvider(scenario),
    });
    expect(records).toHaveLength(36);
    expect(records.slice(0, 2).map((record) => record.experiment.arm)).toEqual(["asymmetric", "full_information"]);
    expect(JSON.parse(await readFile(json, "utf8")).currentPilot.records).toBe(36);
    expect(await readFile(markdown, "utf8")).toMatch(/Information-View Pilot/);
  });

  it("runs one selected scenario and displays every decision stage", async () => {
    const output = capture();
    const files = await paths();
    const [record] = await runCli({
      args: ["--scenario", "S2", "--output", files.audit, "--results", files.results],
      env: {},
      stdout: output.stream,
      idGenerator: () => "cli-run",
    });
    expect(record.scenarioId).toBe("S2");
    expect(output.read()).toMatch(/Customer Resolution: APPROVE[\s\S]*Policy Compliance: ESCALATE[\s\S]*Conflict: decision_mismatch[\s\S]*Evaluation classifications: decision_disagreement \(material=yes\)[\s\S]*Arbitrator: ESCALATE[\s\S]*Policy verification: ESCALATE[\s\S]*Final simulated disposition: ESCALATE/);
  });

  it("supports repeated live evaluations with unique IDs and repeat indexes", async () => {
    const files = await paths();
    let nextId = 0;
    const records = await runCli({
      args: ["--mode", "live", "--scenario", "S2", "--runs", "3", "--output", files.audit, "--results", files.results],
      env: { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "test-model" },
      stdout: { write() {} },
      idGenerator: () => `live-run-${++nextId}`,
      providerFactory: ({ scenario }) => createMockProvider(scenario),
    });
    expect(records.map((record) => [record.provenance, record.repeatIndex, record.runId])).toEqual([
      ["live_evaluation", 1, "live-run-1"],
      ["live_evaluation", 2, "live-run-2"],
      ["live_evaluation", 3, "live-run-3"],
    ]);
  });

  it("exports CSV when requested", async () => {
    const files = await paths("csv");
    await runCli({
      args: ["--scenario", "S1", "--output", files.audit, "--results", files.results, "--format", "csv"],
      env: {},
      stdout: { write() {} },
    });
    expect((await readFile(files.results, "utf8")).split("\n")[0]).toContain("scenarioId,expectedPolicyVerdict,provenance");
  });

  it("returns a nonzero code for invalid scenarios without printing environment secrets", async () => {
    const output = capture();
    const code = await main({ args: ["--scenario", "S99"], env: { OPENAI_API_KEY: "never-print-this" }, stderr: output.stream, stdout: { write() {} } });
    expect(code).toBe(1);
    expect(output.read()).toContain("Unknown scenario");
    expect(output.read()).not.toContain("never-print-this");
  });

  it("prints help without creating output files", async () => {
    const output = capture();
    expect(await main({ args: ["--help"], env: {}, stdout: output.stream, stderr: output.stream })).toBe(0);
    expect(output.read()).toContain("Usage:");
  });

  it("gives actionable guidance when live credentials are missing", async () => {
    const output = capture();
    expect(await main({ args: ["--mode", "live", "--scenario", "S2"], env: {}, stdout: { write() {} }, stderr: output.stream })).toBe(1);
    expect(output.read()).toContain("OPENAI_API_KEY is required in live mode");
  });
});
