import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runRefundCase } from "../../src/application/runRefundCase.js";
import { getScenario } from "../../fixtures/scenarios.js";
import { buildExperimentReport, writeExperimentReport } from "../../src/infrastructure/experimentReport.js";
import { createMockProvider } from "../../src/providers/mockProvider.js";
import { runInformationViewPair } from "../../src/application/runInformationViewPair.js";

const cleanup = [];
afterEach(async () => Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

async function recordFor(id) {
  const scenario = getScenario(id);
  return runRefundCase({ scenario, provider: createMockProvider(scenario), mode: "mock", repeatIndex: 1 });
}

describe("experiment report", () => {
  it("summarizes classifications, material disagreement, arbitration, latency, and tokens", async () => {
    const records = await Promise.all(["S2", "S5", "S8", "S9"].map(recordFor));
    const report = buildExperimentReport(records);

    expect(report).toMatchObject({
      provenance: "mock_demonstration",
      totalRuns: 4,
      scenarioCount: 4,
      overall: {
        validInitialComparisons: 3,
        classifications: {
          decision_disagreement: 1,
          condition_disagreement: 0,
          incorrect_consensus: 1,
          operational_failure: 1,
          correct_consensus: 1,
        },
        materialDisagreements: 1,
        materialDisagreementRate: 1 / 3,
        arbitration: {
          invoked: 1,
          successful: 1,
          correctDecisions: 1,
          conservativeEscalations: 0,
          incorrectDecisions: 0,
          policyAccuracy: 1,
        },
      },
    });
    expect(report.scenarios.map((row) => row.scenarioId)).toEqual(["S2", "S5", "S8", "S9"]);
    expect(report.limitations.join(" ")).toMatch(/mock.*not.*live/i);
  });

  it("distinguishes conservative escalation from a correct arbitrator decision", async () => {
    const record = structuredClone(await recordFor("S2"));
    record.expectedPolicyVerdict = "APPROVE";
    record.policyVerdict = { decision: "APPROVE", reasons: ["fixture"], ruleIds: ["RPV1-1"] };
    record.finalDisposition = "APPROVE";
    const report = buildExperimentReport([record]);

    expect(report.overall.arbitration).toMatchObject({
      correctDecisions: 0,
      conservativeEscalations: 1,
      incorrectDecisions: 0,
      policyAccuracy: 0,
    });
  });

  it("writes a consolidated JSON report", async () => {
    const root = await mkdtemp(join(tmpdir(), "refund-report-"));
    cleanup.push(root);
    const outputPath = join(root, "nested", "report.json");
    await writeExperimentReport({ records: [await recordFor("S9")], outputPath });
    expect(JSON.parse(await readFile(outputPath, "utf8"))).toMatchObject({ totalRuns: 1, scenarioCount: 1 });
  });

  it("adds paired attribution and identical-set strategy metrics for information-view records", async () => {
    const scenario = getScenario("S15");
    const result = await runInformationViewPair({
      scenario, providerFactory: () => createMockProvider(scenario), mode: "mock", repeatIndex: 1, pairId: "report-pair",
    });
    const report = buildExperimentReport(result.records);
    expect(report.informationView.pairs).toBe(1);
    expect(report.informationView.attributionCounts.no_decision_disagreement).toBe(1);
    expect(report.informationView.strategyComparison.eligibility.decisionDisagreements).toBe(0);
  });
});
