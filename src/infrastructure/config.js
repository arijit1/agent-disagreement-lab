function positiveInteger(value, name, { allowZero = false } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || (allowZero ? number < 0 : number <= 0)) {
    throw new RangeError(`${name} must be ${allowZero ? "a nonnegative" : "a positive"} integer`);
  }
  return number;
}

function parseArgs(args) {
  const supported = new Set(["--mode", "--scenario", "--suite", "--runs", "--output", "--results", "--report", "--format", "--handoff-md", "--handoff-json"]);
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!supported.has(option)) throw new RangeError(`Unknown option: ${option}`);
    if (value === undefined || value.startsWith("--")) throw new RangeError(`Missing value for ${option}`);
    if (Object.hasOwn(values, option)) throw new RangeError(`Duplicate option: ${option}`);
    values[option] = value;
  }
  return values;
}

export function loadConfig({ env = process.env, args = [] } = {}) {
  const values = parseArgs(args);
  const mode = values["--mode"] ?? "mock";
  if (!new Set(["mock", "live"]).has(mode)) throw new RangeError(`Unsupported mode: ${mode}`);
  const resultsFormat = values["--format"] ?? "json";
  if (!new Set(["json", "csv"]).has(resultsFormat)) throw new RangeError(`Unsupported results format: ${resultsFormat}`);
  const scenarioId = values["--scenario"] ?? null;
  const suite = values["--suite"] ?? null;
  if (suite !== null && !new Set(["disagreement", "information-view"]).has(suite)) throw new RangeError(`Unknown scenario suite: ${suite}`);
  if (scenarioId !== null && suite !== null) throw new RangeError("--scenario and --suite cannot be combined");

  const apiKey = env.OPENAI_API_KEY?.trim() || null;
  const model = env.OPENAI_MODEL?.trim() || null;
  if (mode === "live" && !apiKey) throw new TypeError("OPENAI_API_KEY is required in live mode");
  if (mode === "live" && !model) throw new TypeError("OPENAI_MODEL is required in live mode");

  const informationView = suite === "information-view";
  const resultsOutputPath = values["--results"] ?? (informationView
    ? `outputs/${mode === "live" ? "live-" : "mock-"}information-view-results.${resultsFormat}`
    : `outputs/experiment-results.${resultsFormat}`);
  const reportOutputPath = values["--report"] ?? (values["--results"]
    ? resultsOutputPath.replace(/\.[^./]+$/, "") + ".report.json"
    : informationView ? `outputs/${mode === "live" ? "live-" : "mock-"}information-view-report.json` : "outputs/experiment-report.json");

  return {
    mode,
    scenarioId,
    suite,
    auditOutputPath: values["--output"] ?? (informationView ? `outputs/${mode === "live" ? "live-" : "mock-"}information-view-audit.jsonl` : "outputs/decisions.jsonl"),
    resultsOutputPath,
    reportOutputPath,
    resultsFormat,
    runs: positiveInteger(values["--runs"] ?? "1", "runs"),
    ...(informationView ? {
      handoffMarkdownPath: values["--handoff-md"] ?? "outputs/article-agent-handoff.md",
      handoffJsonPath: values["--handoff-json"] ?? "outputs/article-agent-handoff.json",
    } : {}),
    openai: {
      apiKey,
      model,
      timeoutMs: positiveInteger(env.OPENAI_TIMEOUT_MS ?? "30000", "OPENAI_TIMEOUT_MS"),
      maxRetries: positiveInteger(env.OPENAI_MAX_RETRIES ?? "1", "OPENAI_MAX_RETRIES", { allowZero: true }),
      maxOutputTokens: positiveInteger(env.OPENAI_MAX_OUTPUT_TOKENS ?? "1600", "OPENAI_MAX_OUTPUT_TOKENS"),
    },
  };
}
