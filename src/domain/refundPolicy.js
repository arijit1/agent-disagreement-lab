const rules = [
  { id: "RPV1-1", text: "Standard refunds are eligible from 0 through 30 days inclusive when normal return conditions are met." },
  { id: "RPV1-2", text: "After 30 days, a refund requires a qualifying delivery-related issue and verified supporting evidence." },
  { id: "RPV1-3", text: "A customer's report alone is not verified evidence." },
  { id: "RPV1-4", text: "A plausible late delivery issue with missing or unverified evidence must be escalated." },
  { id: "RPV1-5", text: "A request that clearly fails the rules with no plausible exception is rejected." },
  { id: "RPV1-6", text: "Unknown, conflicting, or incomplete facts must be escalated and never automatically approved." },
  { id: "RPV1-7", text: "This demonstration does not execute refunds, and AI recommendations do not confer authorization." },
];

export const REFUND_POLICY_V1 = Object.freeze({
  version: "REFUND_POLICY_V1",
  rules: Object.freeze(rules.map((rule) => Object.freeze(rule))),
  text: rules.map((rule) => `${rule.id}: ${rule.text}`).join("\n"),
});
