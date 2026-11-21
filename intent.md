# Intent

> Quest assessment: weekly rewards settlement. Fictional service, synthetic data, no live systems.
> Repository: https://github.com/sahilms76/rewardsSettlementQuest · Final instructions and results: [directive.md](https://github.com/sahilms76/rewardsSettlementQuest/blob/main/directive.md)

## Why this problem?

I chose **duplicate payouts on retry or duplicate input** (DEF-001). It has the highest user and business impact and the highest likelihood of the problems I considered, at a low cost to reproduce. Retries aren't an edge case for a weekly settlement job: schedulers deliver at least once, operators re-run jobs when something downstream (such as notifications) fails, and task exports can repeat rows. A job written as if it ran exactly once will overpay, and it does so silently, because users still get one notification.

## Problems considered and how I ranked them

Criteria, scored 1 (low) to 5 (high): **user/business impact**, **likelihood** (how often the trigger occurs), and **effort** to reproduce and fix in this sample (lower is better). Priority = impact × likelihood ÷ effort. The scores are my estimates, not measurements.

| # | Failure | User / business impact | Likelihood | Effort | Priority |
|---|---|---|---|---|---|
| **1** | **Duplicate payout on retry or duplicate task ID** | 5: direct overpayment, ledger wrong, painful claw-back | 5: retries and re-runs are routine | 2 | **12.5** |
| 2 | Window boundary off by one (wrong end instant, or `<=` instead of `<`): a task at the week's edge is paid in both weeks, the wrong week, or never | 4: double pay, late pay or lost pay at the edge | 3: classic off-by-one, but needs a task on the exact instant | 1 | 12.0 |
| 3 | Local time used instead of UTC: tasks near midnight shift weeks (e.g. PKT +05:00, UK BST) | 3: paid in the wrong week, wrong total in the notification | 3: depends on how producers stamp times | 2 | 4.5 |
| 4 | Notification failure rolls back the payout (payout and notify in one transaction) | 4: user loses earned credits | 2: a design choice rather than a typo | 2 | 4.0 |
| 5 | Notification sent before or without a successful payout | 3: user told about credits they don't have, support load | 2 | 2 | 3.0 |

## Why it ranked first

- Candidate 2 scores close, but it needs a task on the exact boundary instant, and its worst case (paying twice) overlaps with candidate 1.
- Candidate 1 has the most realistic trigger chain: notification fails, the operator re-runs the job, and every task in the window is paid again.
- It's silent. Users see one notification, so nobody reports it until a ledger reconciliation.

Candidates 2–5 are not solved as defects. They're covered by test cases that pass on both builds (TC-04, TC-05, TC-11, TC-12 and others), which act as controls for DEF-001 and as guards if those rules regress later.

## Affected users

- **Task completers (end users):** their balance is overstated, and a later claw-back removes credits they were shown, which damages trust.
- **Finance / the rewards budget owner:** credits paid with no qualifying work; the ledger no longer matches completed work.
- **Operations / on-call:** re-running a failed job, the normal recovery step, becomes unsafe.
- **Support:** handles claw-back complaints that are hard to explain.

## Evidence

- **No incident history.** This is a fictional service with no real data, so I have no frequency data and haven't invented any. Likelihood is based on how scheduled jobs normally behave (at-least-once delivery, manual re-runs, repeated export rows).
- **Reproduced, not assumed.** The faulty build pays T-601 and T-602 twice on a re-run (TC-08: 4 ledger entries, 20 credits each instead of 10). Results are in [`results/summary.md`](https://github.com/sahilms76/rewardsSettlementQuest/blob/main/results/summary.md) and [`results/e2e-summary.md`](https://github.com/sahilms76/rewardsSettlementQuest/blob/main/results/e2e-summary.md).

## Intended value

- A **regression check that blocks DEF-001 from returning**: it fails on the faulty build, passes on the corrected one, and runs as a CI release gate.
- A **business rule written down** (BR-5: a task ID is paid at most once, ever), so the expected behaviour isn't left implicit.
- A **safe retry**: operators can re-run the job after any failure without overpaying.
- A **test bench** that lets a tester reproduce every case by hand, without reading code.

## Non-goals

- Fixing or deeply testing the other ranked problems (2–5). They're guarded by passing cases only.
- Concurrent overlapping runs against a real database (needs a unique constraint; listed as gap G1).
- Account lifecycle rules (closed, suspended or merged accounts), notification content and provider behaviour, and performance.
- Any live or production system, real money or real users.

## What's uncertain

- **Scores are estimates.** In a real project I'd calibrate them with scheduler retry logs, export duplicate rates and support tickets.
- **Concurrency.** The in-memory ledger is synchronous, so two overlapping runs aren't tested.
- **Rule interpretations.** "Counted once" is read as once ever (global key), not once per week. Notification is read as one per account per window. Both are recorded as assumptions in [docs/test-cases.md](https://github.com/sahilms76/rewardsSettlementQuest/blob/main/docs/test-cases.md#assumptions) and should be confirmed with the product owner.

## Approach

1. Map the flow and mark where each failure can enter ([docs/flow.md](https://github.com/sahilms76/rewardsSettlementQuest/blob/main/docs/flow.md)).
2. Write 13 cases covering the happy path, cut-off, timezone, duplicate input, retry and partial failure ([docs/test-cases.md](https://github.com/sahilms76/rewardsSettlementQuest/blob/main/docs/test-cases.md)).
3. Build a faulty and a corrected implementation that differ only in DEF-001.
4. Prove the regression fails on the faulty build for exactly the duplicate and retry cases, and passes on the fix.
5. Make every case reproducible by hand in a test bench UI, and automate the same cases with Playwright through that UI.
6. Gate both suites in CI so the defect can't come back.
