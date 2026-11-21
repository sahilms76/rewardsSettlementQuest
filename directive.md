# Directive: prevent duplicate payouts in the weekly rewards settlement

> Fictional rewards service built for the Quest assessment. The rules below are assessment rules, not a description of a live product. No live financial system was tested.

## Objective

Reproduce and permanently block the highest-impact failure in the settlement, payout and notification flow: **a task paid more than once when the settlement job is retried or receives a task ID twice (DEF-001)**. The faulty build also carries seven more defects (DEF-002..DEF-008), one or more behind every rule BR-1..BR-7, so every case fails on it and passes on the fix. The deliverable is an automated regression, at unit level (node:test) and end-to-end level (Playwright through a test bench UI), that fails against the faulty behaviour, passes against the corrected implementation, and runs as a release gate. The same UI lets a tester reproduce every case by hand.

## Scope

**In scope**

- Settlement window calculation for the Tuesday 09:00 UTC run, including the run-time cut-off.
- Qualification: `completed` status and `completedAt` inside the window after UTC conversion.
- Payout of 10 credits per qualifying task, paid exactly once per task ID.
- Notification only after a successful payout, with no reversal on notification failure.
- Retry behaviour: full re-run, retry after a partial ledger failure, and retry after a notification failure.
- A local test bench UI for manual testing, with a Fixed/Buggy build switch, and a Playwright suite that drives it.

**Out of scope**

- Live or production systems, real money, real users.
- Database concurrency (the sample uses an in-memory ledger; see gap G1).
- Account lifecycle rules, notification content and provider, and performance (gaps G2–G7).

## Business rules (requirements)

| ID | Rule |
|---|---|
| BR-1 | The job runs every Tuesday at 09:00 UTC. A run before that time settles the previous window. |
| BR-2 | The window is `[previous Monday 00:00 UTC, following Monday 00:00 UTC)`: start included, end excluded. |
| BR-3 | Timestamps are compared as instants; any offset is converted to UTC first. |
| BR-4 | Only `completed` tasks qualify. Each earns 10 credits. |
| BR-5 | A task ID is paid at most once, ever: across duplicate rows, retries, re-runs and later re-deliveries. |
| BR-6 | Every account with a successful payout in the window is notified, only such accounts are, and the message states the window total. |
| BR-7 | A notification failure never reverses a payout. It is retried on a later run, and a delivered notification is never re-sent. |
| BR-8 | One failed payout write doesn't stop the batch; the task is paid by the next run. |

## Requirements for the deliverable

1. 8 or more cases with explicit inputs and expected outcomes, covering the happy path, a cut-off boundary, a timezone conversion, duplicate input, a retry and partial failure.
2. A minimal, reproducible, deterministic fixture: fixed clock, fresh state per test, no network. The unit suite and the UI need no dependencies; Playwright is the only dev dependency.
3. A faulty and a corrected implementation that differ only in the defects under test (DEF-001..DEF-008).
4. Evidence that the regression fails on the faulty build and passes on the fix.
5. A defect report with repro steps, expected vs actual, severity rationale, root cause, evidence, fix, and the release checks that block it.
6. A release-readiness checklist with remaining gaps, a decision and handoff steps.
7. Playwright tests written to the team's assertion standard: outcome-style names that cite the case, literal expected values, one outcome per test with grouped soft assertions, condition-based waits, `data-testid` locators, no shared state.

## Completion criteria

| # | Criterion | Met |
|---|---|---|
| C1 | 8 or more cases, all six required categories covered | ✅ 13 cases ([test-cases.md](docs/test-cases.md)) |
| C2 | Regression fails on the faulty build for every case, each with a named defect and broken rule | ✅ all 13 fail ([buggy-run.txt](results/buggy-run.txt)) |
| C3 | All cases pass on the corrected build | ✅ 13/13 ([fixed-run.txt](results/fixed-run.txt)) |
| C4 | `npm run evidence` exits 0 (detection and fix both proven) | ✅ ([summary.md](results/summary.md)) |
| C4b | Playwright: `npm run e2e:evidence` exits 0. Faulty build fails every case and UI-01 (UI-02 passes); fixed build passes 15/15 (13 cases plus 2 UI input tests) | ✅ ([e2e-summary.md](results/e2e-summary.md)) |
| C5 | CI gates (unit and Playwright) configured to block a merge on failure | ✅ ([ci.yml](.github/workflows/ci.yml)) |
| C6 | Defect report and release-readiness checklist complete | ✅ |
| C7 | Release decision recorded | ✅ GO for the sample; GO WITH CONDITIONS for production |

## Results and handoff appendix

| Item | Link |
|---|---|
| Loom walkthrough (5 min or less) | `<LOOM_URL>` |
| Repository (runnable test project) | https://github.com/sahilms76/rewardsSettlementQuest |
| Why this problem, and alternatives ranked | [intent.md](intent.md) |
| Flow map and risk points | [docs/flow.md](docs/flow.md) |
| Test cases (13) with inputs, expected outcomes and results | [docs/test-cases.md](docs/test-cases.md) |
| Test bench UI (manual testing, `npm start`) | [ui/index.html](ui/index.html), [ui/app.js](ui/app.js); scenarios in [manual/](manual/index.json) |
| Playwright E2E suite | [e2e/settlement.spec.ts](e2e/settlement.spec.ts), page object [e2e/pages/TestBench.ts](e2e/pages/TestBench.ts), [playwright.config.ts](playwright.config.ts) |
| Unit suite | [test/settlement.test.js](test/settlement.test.js), fixtures in [test/fixtures.js](test/fixtures.js) |
| Faulty implementation (reproduces DEF-001..DEF-008) | [src/settlement.buggy.js](src/settlement.buggy.js) |
| Corrected implementation | [src/settlement.fixed.js](src/settlement.fixed.js) |
| Defect and root-cause report | [docs/defect-report.md](docs/defect-report.md) |
| Release-readiness checklist, gaps and decision | [docs/release-readiness.md](docs/release-readiness.md) |
| Evidence: faulty build run (fails) | [results/buggy-run.txt](results/buggy-run.txt), [JUnit](results/buggy-run.junit.xml) |
| Evidence: fixed build run (passes) | [results/fixed-run.txt](results/fixed-run.txt), [JUnit](results/fixed-run.junit.xml) |
| Evidence: per-case summary, both builds (unit) | [results/summary.md](results/summary.md) |
| Evidence: Playwright, both builds | [results/e2e-summary.md](results/e2e-summary.md), console output [faulty](results/e2e-buggy-run.txt) and [fixed](results/e2e-fixed-run.txt), JSON [faulty](results/e2e-buggy.json) and [fixed](results/e2e-fixed.json); HTML reports in the CI `e2e-evidence` artifact |
| CI release gate | [.github/workflows/ci.yml](.github/workflows/ci.yml) |

**Final decision:** GO for the reference implementation. For production, GO WITH CONDITIONS: a unique constraint on `payout_key` plus a concurrent-run test, product owner sign-off on BR-5 and BR-6 interpretations, and a reconciliation alert.

**To verify:** with Node 20 or later, run `npm test` (13 pass), `npm run test:buggy` (13 fail) and `npm run evidence` (exit 0). For Playwright: `npm install`, `npx playwright install chromium`, then `npm run e2e:evidence` (exit 0). For manual testing: `npm start` and open http://localhost:4173.
