# Intent

## Why this problem

I chose **duplicate payouts on retry or duplicate input** (DEF-001) because it combines the highest user and business impact with the highest likelihood, at a low cost to reproduce. Retries aren't an edge case for a weekly settlement job: schedulers deliver at least once, operators re-run jobs when something downstream (such as notifications) fails, and task exports can repeat rows. A job written as if it ran exactly once will overpay, and it does so silently, because users still get one notification.

## Candidate failures and how I ranked them

Scored 1 (low) to 5 (high). Effort is the cost to reproduce and fix in this sample, so lower is better. Priority = impact × likelihood ÷ effort.

| # | Failure | User / business impact | Likelihood | Effort | Priority |
|---|---|---|---|---|---|
| **1** | **Duplicate payout on retry or duplicate task ID** | 5: direct overpayment, ledger wrong, painful claw-back | 5: retries and re-runs are routine | 2 | **12.5** |
| 2 | Window boundary off by one (wrong end instant, or `<=` instead of `<`): a task at the week's edge is paid in both weeks, the wrong week, or never | 4: double pay, late pay or lost pay at the edge | 3: classic off-by-one, but needs a task on the exact instant | 1 | 12.0 |
| 3 | Local time used instead of UTC: tasks near midnight shift weeks (e.g. PKT +05:00, UK BST) | 3: paid in the wrong week, wrong total in the notification | 3: depends on how producers stamp times | 2 | 4.5 |
| 4 | Notification failure rolls back the payout (payout and notify in one transaction) | 4: user loses earned credits | 2: a design choice rather than a typo | 2 | 4.0 |
| 5 | Notification sent before or without a successful payout | 3: user told about credits they don't have, support load | 2 | 2 | 3.0 |

Candidate 2 scores close to 1, but it needs a task on the exact boundary instant, and its worst case overlaps with candidate 1 (paying twice). Candidate 1 also covers the most realistic trigger chain: notification fails, operator re-runs, everyone is paid again. Candidates 2–5 aren't abandoned. All of them are built into the faulty build: candidate 2 as DEF-004 (window end), candidate 3 as DEF-006 (offset ignored), candidate 4 as DEF-002 and candidate 5 as DEF-003. Every case fails on the faulty build, and the rule check names the rule behind each failure, so a failure can still be traced to one defect.

## What's uncertain

- **No incident history.** This is a fictional service with no real data, so the impact and likelihood scores are reasoned estimates, not measured frequencies. In a real project I'd calibrate them with scheduler retry logs, export duplicate rates and support tickets.
- **Concurrency.** The in-memory ledger is synchronous, so two overlapping runs aren't tested. The fix relies on a database unique constraint for that, and it's listed as gap G1.
- **Rule interpretations.** "Counted once" is read as once ever (global key), not once per week. Notification is read as one per account per window. Both are recorded as assumptions in `docs/test-cases.md` and should be confirmed with the product owner.

## Approach

1. Map the flow and mark where each failure can enter ([`docs/flow.md`](docs/flow.md)).
2. Write 13 cases covering the happy path, cut-off, timezone, duplicate input, retry and partial failure ([`docs/test-cases.md`](docs/test-cases.md)).
3. Build a faulty and a corrected implementation that differ only in eight marked defects (DEF-001..DEF-008), one or more per business rule, so every case fails on the faulty build for a named reason.
4. Prove the regression fails on the faulty build and passes on the fix, and save the evidence (`results/`).
5. Make every case reproducible by hand in a test bench UI with a Fixed/Buggy switch, and automate the same cases end to end with Playwright through that UI.
6. Gate both suites in CI so it can't come back.
