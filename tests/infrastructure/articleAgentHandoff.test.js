import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runInformationViewPair } from "../../src/application/runInformationViewPair.js";
import { evaluateFiveRepeatGate, writeArticleAgentHandoff } from "../../src/infrastructure/articleAgentHandoff.js";
import { getScenario } from "../../fixtures/scenarios.js";

const cleanup = [];
afterEach(async () => Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

async function pair() {
  const scenario = getScenario("S15");
  return runInformationViewPair({
    scenario, mode: "mock", repeatIndex: 1, pairId: "handoff-pair",
    idGenerator: (() => { let index = 0; return () => `handoff-${++index}`; })(),
    providerFactory: ({ arm }) => ({ evaluate({ role }) {
      const source = role === "arbitrator" ? scenario.mock.policy_compliance.value : scenario.mock[role].value;
      const decision = arm === "asymmetric" && role === "customer_resolution" ? "APPROVE" : "REJECT";
      return { recommendation: { ...source, agent: role, decision, reason: "fixture" }, meta: { model: "mock", usage: null } };
    } }),
  });
}

describe("article-agent handoff", () => {
  it("uses four predeclared criteria and fails safely on no evidence", () => {
    const gate = evaluateFiveRepeatGate([], []);
    expect(gate.passed).toBe(false);
    expect(Object.keys(gate.criteria)).toEqual(["decisionDisagreements", "scenarioCoverage", "accessAssociatedPairs", "validInitialPairRate"]);
    expect(gate.criteria.validInitialPairRate.observed).toBeNull();
  });

  it("writes equivalent JSON and cautious Markdown while separating historical results", async () => {
    const root = await mkdtemp(join(tmpdir(), "article-handoff-"));
    cleanup.push(root);
    const markdownPath = join(root, "handoff.md");
    const jsonPath = join(root, "handoff.json");
    const result = await pair();
    const summary = await writeArticleAgentHandoff({
      records: result.records,
      historicalReport: { provenance: "live_evaluation", totalRuns: 25 },
      markdownPath,
      jsonPath,
    });
    const json = JSON.parse(await readFile(jsonPath, "utf8"));
    const markdown = await readFile(markdownPath, "utf8");
    expect(json).toEqual(summary);
    expect(json.currentPilot.pairAnalysis[0].attribution).toBe("access_associated");
    expect(json.historicalExperiment).toEqual({ provenance: "live_evaluation", totalRuns: 25 });
    expect(markdown).toMatch(/associated with different information access/i);
    expect(markdown).not.toMatch(/reasoning failure/i);
    expect(markdown).not.toContain("OPENAI_API_KEY");
  });
});
