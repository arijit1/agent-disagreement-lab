import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runRefundCase } from "../../src/application/runRefundCase.js";
import { getScenario } from "../../fixtures/scenarios.js";
import { createJsonlAuditRepository } from "../../src/infrastructure/jsonlAuditRepository.js";
import { createMockProvider } from "../../src/providers/mockProvider.js";

const cleanup = [];
afterEach(async () => Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

async function recordFor(id = "S2") {
  const scenario = getScenario(id);
  return runRefundCase({ scenario, provider: createMockProvider(scenario), mode: "mock", repeatIndex: 1, idGenerator: () => `run-${id}` });
}

describe("JSONL audit repository", () => {
  it("creates parent directories and appends exactly one validated record per line", async () => {
    const root = await mkdtemp(join(tmpdir(), "refund-audit-"));
    cleanup.push(root);
    const outputPath = join(root, "nested", "audit.jsonl");
    const repository = createJsonlAuditRepository({ outputPath });
    await repository.append(await recordFor("S1"));
    await repository.append(await recordFor("S2"));

    const lines = (await readFile(outputPath, "utf8")).trim().split("\n").map(JSON.parse);
    expect(lines.map((line) => line.scenarioId)).toEqual(["S1", "S2"]);
  });

  it("rejects extra secret-bearing fields rather than serializing them", async () => {
    const root = await mkdtemp(join(tmpdir(), "refund-audit-"));
    cleanup.push(root);
    const outputPath = join(root, "audit.jsonl");
    const repository = createJsonlAuditRepository({ outputPath });
    await expect(repository.append({ ...(await recordFor()), apiKey: "secret-value" })).rejects.toThrow();
    await expect(readFile(outputPath, "utf8")).rejects.toThrow();
  });

  it("surfaces filesystem failures", async () => {
    const root = await mkdtemp(join(tmpdir(), "refund-audit-"));
    cleanup.push(root);
    const blockingFile = join(root, "file");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(blockingFile, "not a directory");
    const repository = createJsonlAuditRepository({ outputPath: join(blockingFile, "audit.jsonl") });
    await expect(repository.append(await recordFor())).rejects.toThrow();
  });
});
