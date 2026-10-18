import { decisionRecordSchema } from "./schemas.js";

export function classifyPairAttribution(asymmetric, control) {
  const hasFailure = [asymmetric, control].some((record) => record.evaluation.classifications.includes("operational_failure"));
  if (hasFailure) return "unclassifiable_operational_failure";
  const asymmetricDisagrees = asymmetric.conflict.type === "decision_mismatch";
  const controlDisagrees = control.conflict.type === "decision_mismatch";
  if (asymmetricDisagrees && controlDisagrees) return "persistent_across_arms";
  if (asymmetricDisagrees) return "access_associated";
  if (controlDisagrees) return "control_only";
  return "no_decision_disagreement";
}

export function analyzeInformationViewPairs(inputs) {
  const records = inputs.map((record) => decisionRecordSchema.parse(record));
  const groups = new Map();
  for (const record of records) {
    if (record.experiment?.suite !== "information-view") {
      throw new TypeError("Pair analysis requires information-view experiment records.");
    }
    const group = groups.get(record.experiment.pairId) ?? [];
    group.push(record);
    groups.set(record.experiment.pairId, group);
  }

  return [...groups.entries()].map(([pairId, pairRecords]) => {
    const asymmetric = pairRecords.filter((record) => record.experiment.arm === "asymmetric");
    const controls = pairRecords.filter((record) => record.experiment.arm === "full_information");
    if (pairRecords.length !== 2 || asymmetric.length !== 1 || controls.length !== 1) {
      throw new RangeError(`Pair ${pairId} must contain exactly one asymmetric and one full-information record.`);
    }
    const attribution = classifyPairAttribution(asymmetric[0], controls[0]);
    return {
      pairId,
      scenarioId: asymmetric[0].scenarioId,
      repeatIndex: asymmetric[0].repeatIndex,
      attribution,
      asymmetricRunId: asymmetric[0].runId,
      fullInformationRunId: controls[0].runId,
      asymmetricConflictType: asymmetric[0].conflict.type,
      fullInformationConflictType: controls[0].conflict.type,
    };
  });
}
