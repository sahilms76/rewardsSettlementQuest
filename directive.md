# Directive: prevent duplicate payouts in the weekly rewards settlement

> Fictional rewards service built for the Quest assessment, with synthetic data. The rules below are assessment rules, not a description of a live product. No live financial system was tested.
> Developed from [intent.md](https://github.com/sahilms76/rewardsSettlementQuest/blob/main/intent.md). Repository: https://github.com/sahilms76/rewardsSettlementQuest

## Objective

Reproduce and permanently block the highest-ranked failure in the settlement, payout and notification flow: **a task paid more than once when the settlement job is retried or receives a task ID twice (DEF-001)**. Deliver an automated regression, at unit level (node:test) and end-to-end level (Playwright through a test bench UI), that fails against the faulty behaviour, passes against the corrected implementation, and runs as a release gate.

## Scope

**In scope**

- Payout of 10 credits per qualifying task, paid exactly once per task ID, across duplicate rows, retries, re-runs and later re-deliveries (the selected failure).
- The surrounding flow the regression depends on, tested as controls: the Tuesday 09:00 UTC window and cut-off, UTC conversion, the `completed` filter, and notification after payout.
- Retry behaviour: full re-run, retry after a partial ledger failure, and retry after a notification failure.
- A local test bench UI for manual testing, with a Fixed/Buggy switch, and a Playwright suite that drives it.

**Out of scope**

- Live or production systems, real money, real users.
- Fixing the other ranked problems (window boundary, timezone, notification rules). They're guarded by passing cases only.
- Database concurrency (the sample uses an in-memory ledger; gap G1).
- Account lifecycle rules, notification content and provider, and performance (gaps G2–G7).

## Business rules

| ID | Rule |
|---|---|
| BR-1 | The job runs every Tuesday at 09:00 UTC. A run before that time settles the previous window. |
| BR-2 | The window is `[previous Monday 00:00 UTC, following Monday 00:00 UTC)`: start included, end excluded. |
| BR-3 | Timestamps are compared as instants; any offset is converted to UTC first. |
| BR-4 | Only `completed` tasks qualify. Each earns 10 credits. |
| **BR-5** | **A task ID is paid at most once, ever: across duplicate rows, retries, re-runs and later re-deliveries.** (The rule DEF-001 breaks.) |
| BR-6 | Every account with a successful payout in the window is notified, only such accounts are, and the message states the window total. |
| BR-7 | A notification failure never reverses a payout. It is retried on a later run, and a delivered notification is never re-sent. |
| BR-8 | One failed payout write doesn't stop the batch; the task is paid by the next run. |

Assumptions about account changes and admin settings (credits-per-task) are in [docs/test-cases.md](https://github.com/sahilms76/rewardsSettlementQuest/blob/main/docs/test-cases.md#assumptions).

## Requirements

1. 8 or more cases with explicit inputs and expected outcomes, covering the happy path, a cut-off boundary, a timezone conversion, duplicate input, a retry and partial failure.
2. A minimal, reproducible, deterministic fixture: fixed clock, fresh state per test, no network. The unit suite and the UI need no dependencies; Playwright is the only dev dependency.
3. A faulty and a corrected implementation that differ only in DEF-001.
4. Evidence that the regression fails on the faulty build for exactly the DEF-001 cases, and passes on the fix.
5. One defect report with repro steps, expected vs actual, severity rationale, root cause, evidence, fix, and the release checks that block it.
6. A release-readiness checklist with remaining gaps, a decision and handoff steps.

## Completion criteria

| # | Criterion | Met |
|---|---|---|
| C1 | 8 or more cases, all six required categories covered | ✅ 13 cases |
| C2 | Faulty build fails exactly the DEF-001 cases (TC-07..TC-10, TC-13), each on BR-5; the other 8 pass as controls | ✅ |
| C3 | All cases pass on the corrected build | ✅ 13/13 unit, 15/15 Playwright |
| C4 | `npm run evidence` and `npm run e2e:evidence` exit 0 (detection and fix both proven) | ✅ |
| C5 | CI gates (unit and Playwright) configured to block a merge on failure | ✅ |
| C6 | Defect report and release-readiness checklist complete | ✅ |
| C7 | Release decision recorded | ✅ |

---

## Appendix: results and handoff

### Artifact links

| Item | Link |
|---|---|
| Loom walkthrough (5 min or less) | `<LOOM_URL>` |
| Repository (runnable test project) | https://github.com/sahilms76/rewardsSettlementQuest |
| Why this problem, alternatives ranked | [intent.md](https://github.com/sahilms76/rewardsSettlementQuest/blob/main/intent.md) |
| Flow map and risk points | [docs/flow.md](https://github.com/sahilms76/rewardsSettlementQuest/blob/main/docs/flow.md) |
| 13 test cases with inputs, expected outcomes and results | [docs/test-cases.md](https://github.com/sahilms76/rewardsSettlementQuest/blob/main/docs/test-cases.md) |
| Defect and root-cause report (DEF-001) | [docs/defect-report.md](https://github.com/sahilms76/rewardsSettlementQuest/blob/main/docs/defect-report.md) |
| Release-readiness checklist, gaps and decision | [docs/release-readiness.md](https://github.com/sahilms76/rewardsSettlementQuest/blob/main/docs/release-readiness.md) |
| Faulty implementation (DEF-001 marked in code) | [src/settlement.buggy.js](https://github.com/sahilms76/rewardsSettlementQuest/blob/main/src/settlement.buggy.js) |
| Corrected implementation | [src/settlement.fixed.js](https://github.com/sahilms76/rewardsSettlementQuest/blob/main/src/settlement.fixed.js) |
| Unit suite | [test/settlement.test.js](https://github.com/sahilms76/rewardsSettlementQuest/blob/main/test/settlement.test.js) |
| Playwright suite | [e2e/settlement.spec.ts](https://github.com/sahilms76/rewardsSettlementQuest/blob/main/e2e/settlement.spec.ts) |
| Test bench UI and scenarios | [ui/](https://github.com/sahilms76/rewardsSettlementQuest/tree/main/ui), [manual/](https://github.com/sahilms76/rewardsSettlementQuest/tree/main/manual) |
| CI release gate | [.github/workflows/ci.yml](https://github.com/sahilms76/rewardsSettlementQuest/blob/main/.github/workflows/ci.yml) |

### Reproduction and viewing steps

1. `git clone https://github.com/sahilms76/rewardsSettlementQuest && cd rewardsSettlementQuest` (Node 20 or later).
2. Unit, no install needed: `npm test` (fixed, 13 pass), `npm run test:buggy` (faulty, 5 fail), `npm run evidence` (both, exit 0).
3. Playwright: `npm install`, `npx playwright install chromium`, then `npm run e2e:evidence` (exit 0). Add `-- --headed` to `npm run e2e:buggy` to watch it.
4. By hand: `npm start`, open http://localhost:4173/?impl=buggy, choose **TC-08** and select **Run scenario**. The banner shows `RULE BROKEN: BR-5` (`T-601 paid 2 times`, `T-602 paid 2 times`) and both balances are 20. Switch to **Fixed**: `OK: no business rule broken`, balances 10.

### Checks and actual results

| Check | Faulty build | Fixed build | Evidence |
|---|---|---|---|
| Unit (node:test), 13 cases | 5 fail: TC-07, TC-08, TC-09, TC-10, TC-13; 8 pass | 13/13 pass | [summary.md](https://github.com/sahilms76/rewardsSettlementQuest/blob/main/results/summary.md), [buggy-run.txt](https://github.com/sahilms76/rewardsSettlementQuest/blob/main/results/buggy-run.txt), [fixed-run.txt](https://github.com/sahilms76/rewardsSettlementQuest/blob/main/results/fixed-run.txt) |
| Playwright, 13 cases + 2 UI input tests | 5 fail (same cases); 10 pass | 15/15 pass | [e2e-summary.md](https://github.com/sahilms76/rewardsSettlementQuest/blob/main/results/e2e-summary.md) |
| Evidence gates (`npm run evidence`, `npm run e2e:evidence`) | Verdict PASS: the faulty build fails exactly the expected cases | | same |

Key numbers on the faulty build: TC-07 duplicate row 20 credits (expected 10); TC-08 re-run 4 ledger entries (expected 2); TC-09 retry after partial failure 50 (expected 30); TC-10 re-delivered next week 20 (expected 10); TC-13 two re-runs after a notification failure 30 (expected 10).

**Release decision:** GO for the reference implementation. GO WITH CONDITIONS for production: a unique constraint on `payout_key` plus a concurrent-run test, product owner sign-off on the BR-5 and BR-6 interpretations, and a reconciliation alert.

### AI contribution and corrections

I used **Claude (Anthropic) through Claude Code** in VS Code. Claude drafted the code, tests and documents and ran the suites; I set the direction, reviewed the output and made the decisions below.

- **My decisions:** `[fill in: e.g. which problem to choose, the scoring criteria, the test bench UI, the scope narrowing below]`
- **Corrections I made to AI output:**
  - TC-11 (notification failure) and TC-12 (no notification without payout) gave the same result on both builds. I flagged it and had the faulty behaviour reworked so the tests could tell the builds apart.
  - After re-reading the brief ("choose one to solve deeply", "one defect report"), I narrowed an earlier version that seeded eight defects back to DEF-001 only, so the regression isolates the selected failure and the other cases act as controls.
- **Corrections found during verification:** the unit tests for the window cases first always used the correct window function, so they couldn't fail on the faulty build; this was found and fixed. Local file paths and the machine name were scrubbed from the evidence files before publishing. A stale description in the ranking table was corrected.
- **Not AI-generated:** `[fill in]`

### Limitations

- Concurrent overlapping runs aren't tested; production needs a database unique constraint (gap G1).
- Account changes, admin setting changes between runs, DST changeover dates and offset-less timestamps aren't tested (gaps G2, G3, G5).
- No reconciliation alert (G4). Notification content and provider retries, and performance, aren't tested (G6, G7).
- Playwright runs on Chromium only.
- Ranking scores are estimates; there's no incident history behind them.
- Full list: [release-readiness.md, remaining gaps](https://github.com/sahilms76/rewardsSettlementQuest/blob/main/docs/release-readiness.md#remaining-gaps).

### Effort and origin

- **Actual effort:** `[fill in hours]`
- **Origin:** `[fill in: built from scratch for this Quest, or what pre-existed]`
