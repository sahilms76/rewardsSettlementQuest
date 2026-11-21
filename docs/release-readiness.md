# Release readiness: weekly rewards settlement (DEF-001 fix)

## Checklist

| # | Check | Status | Evidence |
|---|---|---|---|
| R1 | Business rules written and agreed (window, 10 credits, once per task ID, notify after payout, notification failure keeps payout) | ✅ Written; ⚠️ PO sign-off needed on 2 interpretations | [`test-cases.md` assumptions](test-cases.md#assumptions) |
| R2 | 8 or more cases cover happy path, cut-off, timezone, duplicate, retry, partial failure | ✅ 13 cases | [`test-cases.md`](test-cases.md) |
| R3 | Regression fails on the faulty build (proves it detects DEF-001) | ✅ exactly TC-07..TC-10 and TC-13 fail, on BR-5; the other 8 pass as controls | [`results/buggy-run.txt`](../results/buggy-run.txt) |
| R4 | Full suite passes on the release build | ✅ 13/13 | [`results/fixed-run.txt`](../results/fixed-run.txt) |
| R5 | Suite runs in CI and blocks merge on failure | ✅ Configured | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) |
| R6 | Guard against the regression becoming a no-op | ✅ `npm run evidence` fails unless the faulty build fails exactly the expected cases | [`scripts/run-evidence.js`](../scripts/run-evidence.js) |
| R6b | Playwright E2E suite through the UI detects DEF-001 and passes on the fix | ✅ Faulty: TC-07..TC-10 and TC-13 fail, 10 pass; fixed: 15/15 | [`results/e2e-summary.md`](../results/e2e-summary.md) |
| R7 | Tests are deterministic and isolated (fixed clock, fresh state or fresh page per test, no network) | ✅ | [`test/fixtures.js`](../test/fixtures.js), [`e2e/fixtures.ts`](../e2e/fixtures.ts) |
| R7b | Manual reproduction possible without code (test bench UI with a Fixed/Buggy switch) | ✅ | [`ui/`](../ui/index.html) |
| R8 | Defect report with root cause and fix | ✅ | [`defect-report.md`](defect-report.md) |
| R9 | Storage-level unique constraint on `payout_key` in the real schema | ⛔ Not applicable to the in-memory sample; **required before production** | Gap G1 |
| R10 | Reconciliation check after each run | ⛔ Not built; recommended | Gap G4 |

## Remaining gaps

| ID | Gap | Risk | Recommendation |
|---|---|---|---|
| G1 | Concurrent overlapping runs are not tested (the in-memory ledger is synchronous) | High in production | Unique constraint plus `INSERT … ON CONFLICT DO NOTHING`; add an integration test with two parallel runs against a real database |
| G2 | Account changes (closed, suspended, merged accounts) not modelled | Medium | Agree a rule (hold, skip or pay) and add cases |
| G3 | Changing the admin credits-per-task setting between runs not tested | Medium | Case: change 10 to 15 mid-week, retry the old window, and confirm paid tasks keep 10 |
| G4 | No reconciliation (`sum(credits) = 10 × distinct paid tasks` per window) | Medium | Post-run assertion and alert |
| G5 | Timestamps without an offset, and DST changeover dates, are not tested (`+05:00` and `+01:00` are covered by TC-05 and UI-01) | Low | Add a DST-changeover case and reject offset-less input upstream |
| G8 | Playwright runs on Chromium only; the "Run all cases" view is used manually but not asserted by Playwright (it repeats the 13 scenario tests) | Low | Add Firefox/WebKit projects if the bench becomes a shared tool |
| G6 | Notification content (template, locale) and provider retries/backoff not tested | Low | Contract test against the notification provider |
| G7 | Large batches and performance not tested | Low | Load test with a realistic weekly volume |

## Decision

**GO for the sample/reference implementation**, and **GO WITH CONDITIONS for a production service**. DEF-001 (duplicate payout) is reproduced, fixed and gated in CI, and every required category passes. Production release is conditional on:

1. R9 / G1: a database unique constraint on `payout_key` and a concurrent-run integration test.
2. R1: product owner sign-off on "paid once ever" and "one notification per account per window".
3. G4: a reconciliation alert in place before the first live run.

## Handoff

1. `git clone https://github.com/sahilms76/rewardsSettlementQuest && cd rewardsSettlementQuest` (Node 20 or later). The unit suite and the UI need no install. For Playwright: `npm install` and `npx playwright install chromium`.
2. `npm test`: runs the suite on the shipped (fixed) build. Expect 13 pass.
3. `npm run test:buggy`: reproduces DEF-001. Expect TC-07..TC-10 and TC-13 to fail and the other 8 to pass.
4. `npm run evidence`: regenerates `results/`, including the summary table and JUnit files. Exit 0 means detection and fix are both proven.
4b. `npm run e2e` / `npm run e2e:buggy` / `npm run e2e:evidence`: the same for the Playwright suite (15 pass on fixed; TC-07..TC-10 and TC-13 fail on buggy, 10 pass).
4c. `npm start`, then http://localhost:4173: manual testing, with Fixed/Buggy switch, editable scenarios and "Run all cases".
5. When adding a rule, add a case to `docs/test-cases.md`, a scenario file in `manual/` (and `manual/index.json`), a unit test in `test/settlement.test.js` and a Playwright test in `e2e/settlement.spec.ts`. If it targets a new defect, add a faulty variant and its expected failures to `scripts/run-evidence.js` and `scripts/run-e2e-evidence.js`.
6. Owners: QA owns the suite and the evidence gate; the backend owner owns G1 (schema) and G4 (reconciliation).
