const defaultDiagnosticCodes = {
  timeout: "timeout",
  invalid_output: "schema_validation",
  refusal: "refusal",
  configuration_error: "configuration",
  provider_error: "provider",
};

export class ProviderError extends Error {
  constructor(category, message, options = {}) {
    super(message);
    this.name = "ProviderError";
    this.category = category;
    this.diagnostic = {
      code: options.diagnosticCode ?? defaultDiagnosticCodes[category] ?? "provider",
      attemptCount: options.attemptCount ?? 1,
      responseStatus: options.responseStatus ?? null,
      issuePaths: options.issuePaths ?? [],
    };
    this.meta = {
      model: options.model ?? null,
      usage: options.usage ?? null,
      attemptCount: options.attemptCount ?? 1,
      successfulAttempts: options.successfulAttempts ?? 0,
      failedAttempts: options.failedAttempts ?? (options.attemptCount ?? 1),
    };
  }
}
