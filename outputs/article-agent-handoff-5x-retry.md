# Information-View Pilot Handoff

## Status

This artifact reports observed live API results. The pilot contains 60 records across 30 paired comparisons.

An `access_associated` result means a disagreement was associated with different information access and disappeared under the full-information control. It does not establish faulty reasoning or an objective conflict.

## Observed paired results

- Attribution counts: {"access_associated":19,"no_decision_disagreement":10,"persistent_across_arms":1}
- Decision disagreements eligible for strategy comparison: 21
- Five-repeat evaluation gate: PASS
- Gate criteria: {"decisionDisagreements":{"threshold":3,"observed":21,"passed":true},"scenarioCoverage":{"threshold":2,"observed":4,"passed":true},"accessAssociatedPairs":{"threshold":1,"observed":19,"passed":true},"validInitialPairRate":{"threshold":0.9,"observed":1,"passed":true}}

## Arbitration comparison

Strategies were compared only on the identical set of valid initial decision-label disagreements. A correct policy decision is reported separately from conservative escalation.

{
  "arbitrator": {
    "eligibleDisagreements": 21,
    "evaluated": 21,
    "unavailable": 0,
    "correctDecisions": 20,
    "policyAccuracy": 0.9523809523809523,
    "decisiveDecisions": 20,
    "decisiveCorrect": 20,
    "decisiveAccuracy": 1,
    "conservativeEscalations": 1,
    "conservativeEscalationRate": 0.047619047619047616,
    "unnecessaryEscalations": 1,
    "unnecessaryEscalationRate": 0.047619047619047616,
    "latency": {
      "totalMs": 145006,
      "averageMs": 6905.047619047619
    },
    "tokenUsage": {
      "totalTokens": 23550,
      "averageTokens": 1121.4285714285713
    }
  },
  "customer": {
    "eligibleDisagreements": 21,
    "evaluated": 21,
    "unavailable": 0,
    "correctDecisions": 0,
    "policyAccuracy": 0,
    "decisiveDecisions": 0,
    "decisiveCorrect": 0,
    "decisiveAccuracy": null,
    "conservativeEscalations": 21,
    "conservativeEscalationRate": 1,
    "unnecessaryEscalations": 21,
    "unnecessaryEscalationRate": 1,
    "latency": {
      "totalMs": 238193,
      "averageMs": 11342.52380952381
    },
    "tokenUsage": {
      "totalTokens": 17489,
      "averageTokens": 832.8095238095239
    }
  },
  "compliance": {
    "eligibleDisagreements": 21,
    "evaluated": 21,
    "unavailable": 0,
    "correctDecisions": 21,
    "policyAccuracy": 1,
    "decisiveDecisions": 21,
    "decisiveCorrect": 21,
    "decisiveAccuracy": 1,
    "conservativeEscalations": 0,
    "conservativeEscalationRate": 0,
    "unnecessaryEscalations": 0,
    "unnecessaryEscalationRate": 0,
    "latency": {
      "totalMs": 238193,
      "averageMs": 11342.52380952381
    },
    "tokenUsage": {
      "totalTokens": 15354,
      "averageTokens": 731.1428571428571
    }
  },
  "conservative_escalation": {
    "eligibleDisagreements": 21,
    "evaluated": 21,
    "unavailable": 0,
    "correctDecisions": 0,
    "policyAccuracy": 0,
    "decisiveDecisions": 0,
    "decisiveCorrect": 0,
    "decisiveAccuracy": null,
    "conservativeEscalations": 21,
    "conservativeEscalationRate": 1,
    "unnecessaryEscalations": 21,
    "unnecessaryEscalationRate": 1,
    "latency": {
      "totalMs": 0,
      "averageMs": 0
    },
    "tokenUsage": {
      "totalTokens": 0,
      "averageTokens": 0
    }
  }
}

## Historical experiment (separate)

{
  "provenance": "live_evaluation",
  "totalRuns": 30,
  "scenarioCount": 6,
  "overall": {
    "runs": 30,
    "validInitialComparisons": 23,
    "classifications": {
      "decision_disagreement": 0,
      "condition_disagreement": 2,
      "incorrect_consensus": 2,
      "operational_failure": 7,
      "correct_consensus": 19
    },
    "materialDisagreements": 0,
    "materialDisagreementRate": 0,
    "decisionPairs": {
      "APPROVE|APPROVE": 5,
      "FAILURE|ESCALATE": 2,
      "ESCALATE|ESCALATE": 11,
      "REJECT|REJECT": 7,
      "FAILURE|REJECT": 3,
      "ESCALATE|FAILURE": 2
    },
    "verificationOutcomes": {
      "APPROVE": 10,
      "REJECT": 10,
      "ESCALATE": 10
    },
    "arbitration": {
      "invoked": 2,
      "successful": 2,
      "correctDecisions": 2,
      "conservativeEscalations": 0,
      "incorrectDecisions": 0,
      "policyAccuracy": 1
    },
    "latency": {
      "totalMs": 324529,
      "averageMs": 10817.633333333333
    },
    "tokenUsage": {
      "totalTokens": 40567,
      "averageTokens": 1352.2333333333333
    }
  },
  "scenarios": [
    {
      "scenarioId": "S9",
      "expectedPolicyVerdict": "APPROVE",
      "runs": 5,
      "validInitialComparisons": 5,
      "classifications": {
        "decision_disagreement": 0,
        "condition_disagreement": 0,
        "incorrect_consensus": 0,
        "operational_failure": 0,
        "correct_consensus": 5
      },
      "materialDisagreements": 0,
      "materialDisagreementRate": 0,
      "decisionPairs": {
        "APPROVE|APPROVE": 5
      },
      "verificationOutcomes": {
        "APPROVE": 5,
        "REJECT": 0,
        "ESCALATE": 0
      },
      "arbitration": {
        "invoked": 0,
        "successful": 0,
        "correctDecisions": 0,
        "conservativeEscalations": 0,
        "incorrectDecisions": 0,
        "policyAccuracy": null
      },
      "latency": {
        "totalMs": 45287,
        "averageMs": 9057.4
      },
      "tokenUsage": {
        "totalTokens": 6910,
        "averageTokens": 1382
      }
    },
    {
      "scenarioId": "S10",
      "expectedPolicyVerdict": "ESCALATE",
      "runs": 5,
      "validInitialComparisons": 4,
      "classifications": {
        "decision_disagreement": 0,
        "condition_disagreement": 0,
        "incorrect_consensus": 0,
        "operational_failure": 1,
        "correct_consensus": 4
      },
      "materialDisagreements": 0,
      "materialDisagreementRate": 0,
      "decisionPairs": {
        "FAILURE|ESCALATE": 1,
        "ESCALATE|ESCALATE": 4
      },
      "verificationOutcomes": {
        "APPROVE": 0,
        "REJECT": 0,
        "ESCALATE": 5
      },
      "arbitration": {
        "invoked": 0,
        "successful": 0,
        "correctDecisions": 0,
        "conservativeEscalations": 0,
        "incorrectDecisions": 0,
        "policyAccuracy": null
      },
      "latency": {
        "totalMs": 39977,
        "averageMs": 7995.4
      },
      "tokenUsage": {
        "totalTokens": 5973,
        "averageTokens": 1194.6
      }
    },
    {
      "scenarioId": "S11",
      "expectedPolicyVerdict": "ESCALATE",
      "runs": 5,
      "validInitialComparisons": 5,
      "classifications": {
        "decision_disagreement": 0,
        "condition_disagreement": 0,
        "incorrect_consensus": 0,
        "operational_failure": 0,
        "correct_consensus": 5
      },
      "materialDisagreements": 0,
      "materialDisagreementRate": 0,
      "decisionPairs": {
        "ESCALATE|ESCALATE": 5
      },
      "verificationOutcomes": {
        "APPROVE": 0,
        "REJECT": 0,
        "ESCALATE": 5
      },
      "arbitration": {
        "invoked": 0,
        "successful": 0,
        "correctDecisions": 0,
        "conservativeEscalations": 0,
        "incorrectDecisions": 0,
        "policyAccuracy": null
      },
      "latency": {
        "totalMs": 41585,
        "averageMs": 8317
      },
      "tokenUsage": {
        "totalTokens": 6404,
        "averageTokens": 1280.8
      }
    },
    {
      "scenarioId": "S12",
      "expectedPolicyVerdict": "REJECT",
      "runs": 5,
      "validInitialComparisons": 4,
      "classifications": {
        "decision_disagreement": 0,
        "condition_disagreement": 2,
        "incorrect_consensus": 0,
        "operational_failure": 1,
        "correct_consensus": 2
      },
      "materialDisagreements": 0,
      "materialDisagreementRate": 0,
      "decisionPairs": {
        "REJECT|REJECT": 4,
        "FAILURE|REJECT": 1
      },
      "verificationOutcomes": {
        "APPROVE": 0,
        "REJECT": 5,
        "ESCALATE": 0
      },
      "arbitration": {
        "invoked": 2,
        "successful": 2,
        "correctDecisions": 2,
        "conservativeEscalations": 0,
        "incorrectDecisions": 0,
        "policyAccuracy": 1
      },
      "latency": {
        "totalMs": 79720,
        "averageMs": 15944
      },
      "tokenUsage": {
        "totalTokens": 9375,
        "averageTokens": 1875
      }
    },
    {
      "scenarioId": "S13",
      "expectedPolicyVerdict": "REJECT",
      "runs": 5,
      "validInitialComparisons": 3,
      "classifications": {
        "decision_disagreement": 0,
        "condition_disagreement": 0,
        "incorrect_consensus": 0,
        "operational_failure": 2,
        "correct_consensus": 3
      },
      "materialDisagreements": 0,
      "materialDisagreementRate": 0,
      "decisionPairs": {
        "REJECT|REJECT": 3,
        "FAILURE|REJECT": 2
      },
      "verificationOutcomes": {
        "APPROVE": 0,
        "REJECT": 5,
        "ESCALATE": 0
      },
      "arbitration": {
        "invoked": 0,
        "successful": 0,
        "correctDecisions": 0,
        "conservativeEscalations": 0,
        "incorrectDecisions": 0,
        "policyAccuracy": null
      },
      "latency": {
        "totalMs": 47771,
        "averageMs": 9554.2
      },
      "tokenUsage": {
        "totalTokens": 5697,
        "averageTokens": 1139.4
      }
    },
    {
      "scenarioId": "S14",
      "expectedPolicyVerdict": "APPROVE",
      "runs": 5,
      "validInitialComparisons": 2,
      "classifications": {
        "decision_disagreement": 0,
        "condition_disagreement": 0,
        "incorrect_consensus": 2,
        "operational_failure": 3,
        "correct_consensus": 0
      },
      "materialDisagreements": 0,
      "materialDisagreementRate": 0,
      "decisionPairs": {
        "ESCALATE|ESCALATE": 2,
        "FAILURE|ESCALATE": 1,
        "ESCALATE|FAILURE": 2
      },
      "verificationOutcomes": {
        "APPROVE": 5,
        "REJECT": 0,
        "ESCALATE": 0
      },
      "arbitration": {
        "invoked": 0,
        "successful": 0,
        "correctDecisions": 0,
        "conservativeEscalations": 0,
        "incorrectDecisions": 0,
        "policyAccuracy": null
      },
      "latency": {
        "totalMs": 70189,
        "averageMs": 14037.8
      },
      "tokenUsage": {
        "totalTokens": 6208,
        "averageTokens": 1241.6
      }
    }
  ],
  "limitations": [
    "Mock provenance is a deterministic demonstration and is not a live model finding.",
    "Live results describe only the observed API calls and do not establish statistical significance.",
    "Arbitrator accuracy is conditional on successful arbitration calls; conservative escalation is reported separately from a correct policy decision.",
    "The deterministic policy verifier remains the final authority and no real refund is executed.",
    "Five repeats per scenario are useful for exploration but insufficient for strong statistical claims."
  ]
}

## Limitations

- Mock outputs are illustrative only and never count as live findings.
- Live observations are run-specific and do not establish statistical significance.
- Information-access association is not evidence that either agent reasoned incorrectly.
- Deterministic policy verification remains authoritative; no real refund was executed.
