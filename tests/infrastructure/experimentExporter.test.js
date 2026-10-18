import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runRefundCase } from "../../src/application/runRefundCase.js";
import { getScenario } from "../../fixtures/scenarios.js";
import { exportExperimentResults } from "../../src/infrastructure/experimentExporter.js";
import { createMockProvider } from "../../src/providers/mockProvider.js";

const cleanup = [];
afterEach(async () => Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

async function recordFor(id, mode = "mock", repeatIndex = 1) {
  const scenario = getScenario(id);
  return runRefundCase({ scenario, provider: createMockProvider(scenario), mode, repeatIndex, idGenerator: () => `${mode}-${id}-${repeatIndex}` });
}

describe("experiment result export", () => {
  it("writes analysis-ready JSON with provenance and independent outcomes", async () => {
    const root = await mkdtemp(join(tmpdir(), "refund-results-"));
    cleanup.push(root);
    const outputPath = join(root, "nested", "results.json");
    await exportExperimentResults({ records: [await recordFor("S6")], outputPath, format: "json" });
    const [row] = JSON.parse(await readFile(outputPath, "utf8"));
    expect(row).toMatchObject({
      scenarioId: "S6",
      expectedPolicyVerdict: "ESCALATE",
      provenance: "mock_demonstration",
      repeatIndex: 1,
      conflict: { type: "decision_mismatch" },
      evaluation: { classifications: ["decision_disagreement"], materialDisagreement: true },
      arbitratorResult: { status: "success", recommendation: { decision: "APPROVE" } },
      verificationOutcome: { decision: "ESCALATE" },
      finalDisposition: "ESCALATE",
      override: { applied: true },
    });
    expect(row).toHaveProperty("agentResponses.customerResolution");
    expect(row).toHaveProperty("latencyMs");
    expect(row).toHaveProperty("tokenUsage");
  });

  it("preserves trusted information-view manifests and retry diagnostics", async () => {
    const record = structuredClone(await recordFor("S15"));
    record.experiment = {
      suite: "information-view", arm: "asymmetric", pairId: "pair-1", executionOrder: 1,
      agentViews: {
        customerResolution: { visibleFields: ["requestId"], facts: { requestId: "REF-S15" } },
        policyCompliance: { visibleFields: ["requestId"], facts: { requestId: "REF-S15" } },
      },
      pairAttribution: "no_decision_disagreement",
    };
    const root = await mkdtemp(join(tmpdir(), "refund-results-"));
    cleanup.push(root);
    const rows = await exportExperimentResults({ records: [record], outputPath: join(root, "view.json"), format: "json" });
    expect(rows[0].experiment).toEqual(record.experiment);
    expect(rows[0].tokenUsage).toHaveProperty("attemptCount");
  });

  it("writes escaped CSV with stable analysis columns", async () => {
    const root = await mkdtemp(join(tmpdir(), "refund-results-"));
    cleanup.push(root);
    const outputPath = join(root, "results.csv");
    await exportExperimentResults({ records: [await recordFor("S2")], outputPath, format: "csv" });
    const [header, row] = (await readFile(outputPath, "utf8")).trim().split("\n");
    expect(header).toBe("scenarioId,expectedPolicyVerdict,provenance,runId,repeatIndex,experiment,agentResponses,conflict,evaluation,arbitratorResult,verificationOutcome,finalDisposition,override,latencyMs,tokenUsage");
    expect(row).toContain("mock_demonstration");
    expect(row).toContain('""decision"":""ESCALATE""');
  });

  it("preserves repeat indexes for repeated live evaluations", async () => {
    const root = await mkdtemp(join(tmpdir(), "refund-results-"));
    cleanup.push(root);
    const outputPath = join(root, "live.json");
    await exportExperimentResults({
      records: [await recordFor("S2", "live", 1), await recordFor("S2", "live", 2)],
      outputPath,
      format: "json",
    });
    expect(JSON.parse(await readFile(outputPath, "utf8")).map((row) => [row.provenance, row.repeatIndex])).toEqual([
      ["live_evaluation", 1],
      ["live_evaluation", 2],
    ]);
  });

  it("rejects mixed mock and live provenance in one experiment file", async () => {
    const root = await mkdtemp(join(tmpdir(), "refund-results-"));
    cleanup.push(root);
    await expect(exportExperimentResults({
      records: [await recordFor("S2", "mock"), await recordFor("S2", "live")],
      outputPath: join(root, "mixed.json"),
      format: "json",
    })).rejects.toThrow(/provenance/);
  });
});
