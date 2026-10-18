import { runRefundCase } from "./runRefundCase.js";
import { classifyPairAttribution } from "../domain/analyzeInformationViewPairs.js";
import { deriveAgentView } from "../domain/deriveAgentView.js";
import { decisionRecordSchema, refundRequestSchema } from "../domain/schemas.js";

function manifest(request, visibleFields) {
  return Object.freeze({
    visibleFields: Object.freeze([...visibleFields]),
    facts: deriveAgentView(request, visibleFields),
  });
}

function viewsFor(scenario, arm) {
  const request = refundRequestSchema.parse(scenario.request);
  const allFields = Object.keys(request);
  const fields = arm === "asymmetric"
    ? scenario.views
    : { customer_resolution: allFields, policy_compliance: allFields };
  return Object.freeze({
    customerResolution: manifest(request, fields.customer_resolution),
    policyCompliance: manifest(request, fields.policy_compliance),
  });
}

export async function runInformationViewPair({
  scenario,
  providerFactory,
  mode,
  repeatIndex,
  pairId,
  idGenerator,
  clock,
  policyEvaluator,
}) {
  const records = [];
  for (const [index, arm] of ["asymmetric", "full_information"].entries()) {
    const agentViews = viewsFor(scenario, arm);
    const record = await runRefundCase({
      scenario,
      provider: providerFactory({ scenario, arm }),
      mode,
      repeatIndex,
      ...(idGenerator ? { idGenerator } : {}),
      ...(clock ? { clock } : {}),
      ...(policyEvaluator ? { policyEvaluator } : {}),
      experimentContext: {
        suite: "information-view",
        arm,
        pairId,
        executionOrder: index + 1,
        agentViews,
        pairAttribution: null,
      },
    });
    records.push(record);
  }
  const attribution = classifyPairAttribution(records[0], records[1]);
  const attributedRecords = records.map((record) => decisionRecordSchema.parse({
    ...record,
    experiment: { ...record.experiment, pairAttribution: attribution },
  }));
  return { records: attributedRecords, attribution };
}
