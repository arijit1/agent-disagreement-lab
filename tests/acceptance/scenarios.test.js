import { describe, expect, it } from "vitest";

import { runRefundCase } from "../../src/application/runRefundCase.js";
import { listScenarios } from "../../fixtures/scenarios.js";
import { createMockProvider } from "../../src/providers/mockProvider.js";

describe("S1-S20 offline acceptance", () => {
  it("produces every expected final disposition deterministically", async () => {
    const results = [];
    for (const scenario of listScenarios()) {
      const record = await runRefundCase({
        scenario,
        provider: createMockProvider(scenario),
        mode: "mock",
        repeatIndex: 1,
        idGenerator: () => `run-${scenario.id}`,
      });
      results.push([scenario.id, record.finalDisposition]);
    }
    expect(results).toEqual([
      ["S1", "APPROVE"],
      ["S2", "ESCALATE"],
      ["S3", "APPROVE"],
      ["S4", "REJECT"],
      ["S5", "ESCALATE"],
      ["S6", "ESCALATE"],
      ["S7", "ESCALATE"],
      ["S8", "ESCALATE"],
      ["S9", "APPROVE"],
      ["S10", "ESCALATE"],
      ["S11", "ESCALATE"],
      ["S12", "REJECT"],
      ["S13", "REJECT"],
      ["S14", "APPROVE"],
      ["S15", "REJECT"],
      ["S16", "ESCALATE"],
      ["S17", "APPROVE"],
      ["S18", "ESCALATE"],
      ["S19", "REJECT"],
      ["S20", "APPROVE"],
    ]);
  });

  it("invokes arbitration only for valid conflicts", async () => {
    const observed = {};
    for (const scenario of listScenarios()) {
      const record = await runRefundCase({ scenario, provider: createMockProvider(scenario), mode: "mock", repeatIndex: 1 });
      observed[scenario.id] = record.arbitratorResult.status !== "not_invoked";
    }
    expect(observed).toEqual({
      S1: false, S2: true, S3: false, S4: false, S5: false, S6: true, S7: false, S8: false,
      S9: false, S10: false, S11: false, S12: false, S13: false, S14: false,
      S15: false, S16: false, S17: false, S18: false, S19: false, S20: false,
    });
  });
});
