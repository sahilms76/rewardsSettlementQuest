# Defect report: DEF-001

One defect, the one chosen in [intent.md](../intent.md). It lives in the faulty build, `src/settlement.buggy.js`, marked `DEFECT (DEF-001)`, and is absent from `src/settlement.fixed.js`. All data is synthetic; no live financial system was tested.

---

# DEF-001: Settlement pays a task again when the job is retried or the task appears twice

| Field | Value |
|---|---|
| Component | Weekly rewards settlement (`src/settlement.buggy.js`, fictional sample) |
| Severity | **S1 / Critical** |
| Priority | P1, blocks release |
| Status | Fixed in `src/settlement.fixed.js`, regression TC-07..TC-10, TC-13 |
| Environment | Local Node 20/22, in-memory ledger and fake notifier, Chromium (Playwright 1.63). No live financial system was used. |
| Found by | Designed regression suite (pre-release), not a production incident |

## Summary

The settlement job writes payouts with a plain insert and has no idempotency key. Any repeated input pays the same task again: a scheduler retry, a manual re-run, a duplicate row in the task export, or the same task re-sent in a later week. The business rule is that a task ID is paid exactly once.

## Steps to reproduce

1. In the browser: `npm start`, open http://localhost:4173/?impl=buggy, choose **TC-08**, and select **Run scenario**. The banner shows `RULE BROKEN: BR-5` with `T-601 paid 2 times` and `T-602 paid 2 times`, and both balances are 20.
1. Automated: `npm run test:buggy` (unit) or `npm run e2e:buggy` (Playwright).
2. Equivalent manual steps, TC-08:
   1. Start with an empty ledger.
   2. Settle tasks T-601 (acc-A) and T-602 (acc-B), both completed `2026-11-03`/`04`, with run time `2026-11-10T09:00:00Z`.
   3. Run the same settlement again for the same run time (simulating the scheduler's retry).
   4. Check balances and ledger entries.

## Expected vs actual

| | Expected (rule) | Actual (faulty build) |
|---|---|---|
| Ledger entries after retry (TC-08) | 2 | **4** |
| acc-A / acc-B balance | 10 / 10 | **20 / 20** |
| Duplicate row in one batch (TC-07) | 1 entry, 10 credits | **2 entries, 20 credits** |
| Retry after partial failure (TC-09) | T-701, T-702, T-703 paid once each (30) | **T-701 and T-703 paid twice (50)** |
| Re-delivered next week (TC-10) | not paid again (10) | **paid again (20)** |
| Retry to resend a failed notification (TC-13) | 10, notified once | **paid again on every re-run** (30 after two re-runs) |

The notification is not duplicated (the notification log guards it), so users see a single "you earned 10 credits" message while the ledger holds 20. The overpayment is silent.

## Evidence

- [`results/buggy-run.txt`](../results/buggy-run.txt): 5 failures, exactly TC-07..TC-10 and TC-13, with assertion diffs, e.g. TC-08 `A: 20, B: 20, entries: 4` vs expected `10, 10, 2`.
- [`results/fixed-run.txt`](../results/fixed-run.txt): 13/13 pass on the corrected build.
- [`results/summary.md`](../results/summary.md): per-case table for both builds (unit).
- [`results/e2e-summary.md`](../results/e2e-summary.md): Playwright through the UI. The faulty build fails exactly TC-07..TC-10 and TC-13, e.g. `getByTestId('balance-acc-A')` expected `"10"`, received `"20"` ([console output](../results/e2e-buggy-run.txt)). The fixed build passes 15/15.
- JUnit: [`results/buggy-run.junit.xml`](../results/buggy-run.junit.xml), [`results/fixed-run.junit.xml`](../results/fixed-run.junit.xml).

## Severity rationale

- **Impact:** direct financial loss (credits paid with no qualifying work) and an inaccurate ledger. It also creates a recovery problem: clawing back credits already shown to users damages trust.
- **Likelihood:** high. Retries are a normal operating event for a scheduled job, not an edge case. TC-13 shows the most natural trigger: an operator re-runs the job because notifications failed, and every task in the window is paid again.
- **Detectability:** low. Notifications aren't duplicated, so neither users nor support see a symptom. It only shows up in a ledger reconciliation.
- **Blast radius:** every task in the window, for every account, on every repeat.

## Root cause

1. **Wrong delivery assumption.** The job assumes it runs exactly once per window and that the export never repeats a task ID. The scheduler is at-least-once and the export can repeat rows.
2. **Non-idempotent write.** Payouts use a plain insert (`ledger.append`) with no unique key, so the storage layer can't reject a second payout for the same task.
3. **No in-batch dedupe.** Duplicate rows in one export are each paid.

The faulty build differs from the corrected one only in this defect. The other eight cases (window, cut-off, timezone, filter, notification rules) pass on both builds and act as controls: they show the suite fails for this defect and nothing else. In the test bench every failing case shows `RULE BROKEN: BR-5` and nothing else.

## Fix (implemented in `src/settlement.fixed.js`)

1. Write each payout with the idempotency key `payout:<taskId>` through `ledger.postOnce`. In a real database this is a **UNIQUE constraint on `payout_key`**, with the insert and the "already exists" check in one statement (`INSERT … ON CONFLICT DO NOTHING`), so concurrent runs can't both win.
2. Skip duplicate task IDs within a batch, and report them (`duplicatesInInput`).
3. Report `alreadyPaid` separately from `paid`, so a retry is visible in the run report and in monitoring.
4. Keep the key global (not per week), so a task re-sent in a later week is never paid again.

## Release checks that block this failure

| Check | Blocks it because |
|---|---|
| CI gate 1: `npm test` on every PR (`.github/workflows/ci.yml`) | TC-07..TC-10 and TC-13 fail if idempotency is removed or broken |
| CI gate 2: `npm run evidence` | Fails if the suite stops detecting the defect against the faulty build, so the regression can't silently become a no-op |
| CI gates 3 and 4: `npm run e2e` and `npm run e2e:evidence` (Playwright) | The same protection end to end, through the UI a tester uses |
| Schema review: unique constraint on `payout_key` | The storage layer rejects a second payout even if application code regresses |
| Pre-release reconciliation: `sum(credits)` = `10 × count(distinct paid task IDs)` per window | Catches any duplicate that gets past the tests (e.g. through a new code path) |
| Runbook rule: re-runs are only allowed through the idempotent job | Stops manual SQL or scripts from bypassing the key |

