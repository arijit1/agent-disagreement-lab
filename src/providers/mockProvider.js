import { ProviderError } from "./providerError.js";

export function createMockProvider(scenario) {
  return Object.freeze({
    async evaluate({ role }) {
      const outcome = scenario.mock[role];
      if (!outcome) {
        throw new ProviderError("configuration_error", `No mock ${role} outcome is configured for ${scenario.id}`);
      }
      if (outcome.kind === "failure") {
        throw new ProviderError(outcome.category, outcome.message);
      }
      return structuredClone({
        recommendation: outcome.value,
        meta: { model: "mock-fixture", usage: null, attemptCount: 1, successfulAttempts: 1, failedAttempts: 0 },
      });
    },
  });
}
