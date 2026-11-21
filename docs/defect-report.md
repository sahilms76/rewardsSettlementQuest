# Defect reports

All defects live in the faulty build, `src/settlement.buggy.js`, each marked `DEFECT (DEF-00n)` in the code. None is present in `src/settlement.fixed.js`. Every regression case fails on the faulty build, and the test bench's rule check shows the broken rule.

| ID | Defect | Rule | Severity | Cases |
|---|---|---|---|---|
| [DEF-001](#def-001-settlement-pays-a-task-again-when-the-job-is-retried-or-the-task-appears-twice) | A task is paid again on a retry or a duplicate row | BR-5 | S1 | TC-07..TC-10, TC-13 |
| [DEF-002](#def-002-a-failed-notification-reverses-the-payout) | A failed notification reverses the payout | BR-7 | S2 | TC-11, TC-13 |
| [DEF-003](#def-003-a-user-is-notified-of-credits-when-their-payout-failed) | Notified of credits when the payout failed | BR-6 | S2 | TC-12, TC-09 |
| [DEF-004](#def-004-the-window-ends-sunday-235959-and-loses-the-last-second-of-the-week) | Window ends Sun 23:59:59 (end included) | BR-2 | S3 | TC-01, TC-04 |
| [DEF-005](#def-005-an-early-tuesday-run-settles-the-week-that-just-ended) | Run-time cut-off is Tuesday 00:00, not 09:00 | BR-1 | S2 | TC-02 |
| [DEF-006](#def-006-timestamp-offsets-are-ignored) | Timestamp offsets ignored | BR-3 | S2 | TC-05, UI-01 |
| [DEF-007](#def-007-in-progress-tasks-are-paid) | In-progress tasks are paid | BR-4 | S1 | TC-06 |
| [DEF-008](#def-008-only-the-first-account-in-a-run-is-notified) | Only the first account in a run is notified | BR-6 | S3 | TC-03, TC-08 |

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
| Retry to resend a failed notification (TC-13) | 10, notified once | **paid again on every re-run** (20 after two re-runs; run 1's payout is also reversed, see DEF-002) |

The notification is not duplicated (the notification log guards it), so users see a single "you earned 10 credits" message while the ledger holds 20. The overpayment is silent.

## Evidence

- [`results/buggy-run.txt`](../results/buggy-run.txt): 13 failures with assertion diffs (every case; see the index above), e.g. TC-08 `A: 20, B: 20, entries: 4` vs expected `10, 10, 2`.
- [`results/fixed-run.txt`](../results/fixed-run.txt): 13/13 pass on the corrected build.
- [`results/summary.md`](../results/summary.md): per-case table for both builds (unit).
- [`results/e2e-summary.md`](../results/e2e-summary.md): Playwright through the UI. The faulty build fails every case and UI-01, e.g. `getByTestId('balance-acc-A')` expected `"10"`, received `"20"` ([console output](../results/e2e-buggy-run.txt)). The fixed build passes 15/15.
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

The faulty build has seven more defects (DEF-002..DEF-008, below). Each one fails its own cases, and the rule check names the rule each failure breaks, so the DEF-001 cases are still identified by BR-5.

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

---

# DEF-002: A failed notification reverses the payout

| Field | Value |
|---|---|
| Component | Weekly rewards settlement (`src/settlement.buggy.js`, fictional sample) |
| Severity | **S2 / Major** |
| Priority | P1, blocks release |
| Status | Not present in `src/settlement.fixed.js`. Regression TC-11 (also contributes to the TC-13 failure) |
| Environment | Same as DEF-001 |
| Found by | Designed regression suite (pre-release), not a production incident |

## Summary

When the notification for an account fails, the faulty build treats the whole settlement for that account as failed. It deletes the account's ledger entries from the run and drops the tasks from the run's "paid" list. This breaks BR-7: a notification failure never reverses a payout. The user did the work, the job ran, and they end with no credits and no message.

## Steps to reproduce

1. In the browser: `npm start`, open http://localhost:4173/?impl=buggy, choose **TC-11** and select **Run scenario**. The banner shows `RULE BROKEN: BR-7` (`T-901 payout reversed after acc-E's notification failed`). acc-E shows balance 0 and 0 notifications, the ledger section shows "No ledger entries.", and run 1 shows Paid now: none and Notification failures: acc-E.
2. Automated: `npm run test:buggy` or `npm run e2e:buggy` (TC-11 fails).
3. Equivalent manual steps, TC-11:
   1. Start with an empty ledger and set the notifier to fail its next send.
   2. Settle T-901 (acc-E), completed `2026-11-04T10:00:00Z`, with run time `2026-11-10T09:00:00Z`.
   3. Check the acc-E balance, ledger entries, notifications and the run report.

## Expected vs actual

| | Expected (BR-7) | Actual (faulty build) |
|---|---|---|
| acc-E balance (TC-11) | 10 | **0** |
| Ledger entries for T-901 | 1 | **0** |
| Run 1 "Paid now" | T-901 | **none** |
| Notifications received | 0 (failure reported, retried next run) | 0 |
| Notification failure reported | acc-E | acc-E |
| TC-13 (notification fails on run 1, two re-runs) | 10, notified once | **run 1 reversed, then paid on each re-run: 20** (combined with DEF-001) |

## Evidence

- [`results/buggy-run.txt`](../results/buggy-run.txt): TC-11 `balance: 0`, expected `balance: 10`, with `failures: ['acc-E']` and `logState: 'failed'` matching.
- [`results/e2e-buggy-run.txt`](../results/e2e-buggy-run.txt): `getByTestId('balance-acc-E')` expected `"10"`, received `"0"`.
- The fixed build passes TC-11 at both levels ([`results/summary.md`](../results/summary.md), [`results/e2e-summary.md`](../results/e2e-summary.md)).

## Severity rationale

- **Impact:** the user loses credits they earned, and they aren't told, because the notification is the step that failed. It's a direct breach of the payout rule and a trust problem once they notice.
- **Likelihood:** medium. It needs a notification provider failure, which is less routine than a scheduler retry, but provider outages do happen and affect every account in the run at once.
- **Detectability:** low for users, medium for operations. The run report lists the notification failures, but not that payouts were removed.
- **Blast radius:** every account whose notification failed in the run. In TC-13 it also combines with DEF-001: the re-run that resends the notification pays again.
- Rated S2 rather than S1 because the company doesn't overpay and the credits can be restored from the task export. It still blocks release because it removes money users earned.

## Root cause

1. **Wrong coupling.** Payout and notification are handled as one unit: the code rolls the payout back when the notification fails, as if both were in one transaction.
2. **Wrong failure model.** A notification is a side effect that can be retried. The payout is the record of what the user earned and must not depend on it.

## Fix (as in `src/settlement.fixed.js` and `src/notifications.js`)

1. Commit the payout first and never change it because of a later step.
2. Record a failed notification in the notification log as `failed` and retry it on the next run. A `delivered` notification is never re-sent.
3. Report notification failures separately (`notificationFailures`) so operations can see them without touching the ledger.

## Release checks that block this failure

| Check | Blocks it because |
|---|---|
| CI gates 1 and 3: `npm test` and `npm run e2e` | TC-11 fails if a notification failure changes the balance, the ledger or the paid list |
| CI gates 2 and 4: `npm run evidence` and `npm run e2e:evidence` | Both expect TC-11 to fail on the faulty build, so the check can't silently stop detecting DEF-002 |
| Design review rule | Payout writes and notifications are never in one transaction; notifications run after the payout is committed |
| Pre-release reconciliation | Per window, every completed in-window task has exactly one payout, whatever the notification outcome |

---

# DEF-003: A user is notified of credits when their payout failed

| Field | Value |
|---|---|
| Component | Weekly rewards settlement (`src/settlement.buggy.js`, fictional sample) |
| Severity | **S2 / Major** |
| Priority | P1, blocks release |
| Status | Not present in `src/settlement.fixed.js`. Regression TC-12 |
| Environment | Same as DEF-001 |
| Found by | Designed regression suite (pre-release), not a production incident |

## Summary

The faulty build works out the notification amount from the qualifying tasks in the input, not from the payouts that were actually written to the ledger. When a payout write fails, the account is still told it earned the credits. This breaks BR-6: notify only an account with a successful payout, and state the window total.

## Steps to reproduce

1. In the browser: `npm start`, open http://localhost:4173/?impl=buggy, choose **TC-12** and select **Run scenario**. The banner shows `RULE BROKEN: BR-6` (`acc-F told 10 credits, ledger has 0`). acc-F shows balance 0 but 1 notification received, and run 1 shows Payout failures: T-1001 and a notification sent to acc-F.
2. Automated: `npm run test:buggy` or `npm run e2e:buggy` (TC-12 fails).
3. Equivalent manual steps, TC-12:
   1. Start with an empty ledger and make the next ledger write for T-1001 fail.
   2. Settle T-1001 (acc-F), completed `2026-11-04T10:00:00Z`, with run time `2026-11-10T09:00:00Z`.
   3. Check the acc-F balance, the notifications sent and the run report.

## Expected vs actual

| | Expected (BR-6) | Actual (faulty build) |
|---|---|---|
| acc-F balance (TC-12) | 0 | 0 |
| Payout failures reported | T-1001 | T-1001 |
| Notifications to acc-F | **0** | **1, saying 10 credits** |
| TC-09 run 1 notification (T-702's write failed) | 20 credits | **30 credits** (TC-09 also fails for DEF-001) |

## Evidence

- [`results/buggy-run.txt`](../results/buggy-run.txt): TC-12 `notified: 1`, expected `notified: 0`, with `balance: 0` and `payoutFailures: ['T-1001']` matching.
- [`results/e2e-buggy-run.txt`](../results/e2e-buggy-run.txt): `getByTestId('notifications-acc-F')` expected `"0"`, received `"1"`.
- The fixed build passes TC-12 at both levels ([`results/summary.md`](../results/summary.md), [`results/e2e-summary.md`](../results/e2e-summary.md)).

## Severity rationale

- **Impact:** the user is told about credits they don't have. That brings support contacts and complaints, and if the credits are later paid, the message and the ledger may disagree on amounts.
- **Likelihood:** medium. It needs a ledger write failure, which is less routine than a retry. When the database has a problem, every affected account gets a wrong message.
- **Detectability:** high for users (they check the balance), low for the system: the run report shows the payout failure and a successful notification, which look normal side by side.
- **Blast radius:** every account with at least one failed payout in the run. An account with some failed payouts gets an overstated total (TC-09).
- Rated S2 because no credits are lost or overpaid. It still blocks release because users get wrong information about money.

## Root cause

1. **Wrong source of truth.** The amount comes from the input ("what should have been paid") instead of the ledger ("what was paid").
2. **No payout check.** Nothing stops a notification for an account with no successful payout.

## Fix (as in `src/settlement.fixed.js` and `src/notifications.js`)

1. Read the notified amount from the ledger for the account and window (`ledger.creditsFor`).
2. Skip the notification when that amount is 0. The failed payout is picked up by the next run, which then sends the notification.

## Release checks that block this failure

| Check | Blocks it because |
|---|---|
| CI gates 1 and 3: `npm test` and `npm run e2e` | TC-12 fails if an account with no successful payout is notified |
| CI gates 2 and 4: `npm run evidence` and `npm run e2e:evidence` | Both expect TC-12 to fail on the faulty build, so the check can't silently stop detecting DEF-003 |
| Pre-release reconciliation | The notified total per account and window equals the ledger total |

---

# DEF-004: The window ends Sunday 23:59:59 and loses the last second of the week

| Field | Value |
|---|---|
| Component | Weekly rewards settlement (`src/settlement.buggy.js`, fictional sample) |
| Severity | **S3 / Minor** |
| Priority | P2, fix before release |
| Rule broken | BR-2 |
| Status | Not present in `src/settlement.fixed.js`. Regression TC-01, TC-04 |

## Summary

The faulty build stores the window end as Sunday 23:59:59 and includes it (`t <= end`), the way a SQL `BETWEEN '…00:00:00' AND '…23:59:59'` works. The rule is Monday 00:00 with the end excluded. A task completed after 23:59:59.000 on Sunday falls between the two weeks and is never paid.

## Steps to reproduce

1. In the browser: `npm start`, open http://localhost:4173/?impl=buggy, choose **TC-04** and select **Run scenario**. The banner shows `RULE BROKEN: BR-2`. Run 1's window reads `… to Sun 08 Nov 2026 23:59:59 UTC (end included)`, T-202 is excluded and acc-A has 10.
2. Automated: `npm run test:buggy` or `npm run e2e:buggy` (TC-01, TC-04 fail).

## Expected vs actual

| | Expected | Actual (faulty build) |
|---|---|---|
| TC-01 window | Mon 02 Nov 00:00 to Mon 09 Nov 00:00 UTC, end excluded | **Mon 02 Nov 00:00 to Sun 08 Nov 23:59:59 UTC, end included** |
| TC-04 T-202 at Sun 23:59:59.999 | paid | **excluded (in neither week)** |
| TC-04 acc-A balance | 20 | **10** |

## Severity rationale

Users lose credits for work completed in the last second of the week. It's rare, so it's rated S3, but it's silent and the reported window is wrong for every run.

## Root cause and fix

- **Cause:** the end bound is written as the last whole second of Sunday instead of the next Monday 00:00, which loses the sub-second gap.
- **Fix (as in the corrected build):** keep a half-open interval `[Monday 00:00, next Monday 00:00)` and compare `start <= t < end` (`src/window.js`).
- **Blocked by:** TC-01, TC-04 in `npm test` and `npm run e2e`; both evidence scripts expect them to fail on the faulty build.


---

# DEF-005: An early-Tuesday run settles the week that just ended

| Field | Value |
|---|---|
| Component | Weekly rewards settlement (`src/settlement.buggy.js`, fictional sample) |
| Severity | **S2 / Major** |
| Priority | P1, blocks release |
| Rule broken | BR-1 |
| Status | Not present in `src/settlement.fixed.js`. Regression TC-02 |

## Summary

The faulty build treats the run as due from Tuesday 00:00 instead of Tuesday 09:00. A run before 09:00 (an early manual run or a clock skew) settles the week that just ended instead of the week before it. The 09:00 cut-off exists so late task exports are in before the week is settled.

## Steps to reproduce

1. In the browser: `npm start`, open http://localhost:4173/?impl=buggy, choose **TC-02** and select **Run scenario**. The banner shows `RULE BROKEN: BR-1`. The run at Tue 10 Nov 08:59:59 settles 2–9 Nov, pays T-022 and excludes T-021.
2. Automated: `npm run test:buggy` or `npm run e2e:buggy` (TC-02 fails).

## Expected vs actual

| | Expected | Actual (faulty build) |
|---|---|---|
| TC-02 window (run at Tue 08:59:59) | Mon 26 Oct to Mon 02 Nov | **Mon 02 Nov to Sun 08 Nov 23:59:59** |
| Paid | T-021 (30 Oct) | **T-022 (4 Nov)** |
| Excluded | T-022 | **T-021** |

## Severity rationale

The wrong week is settled. Tasks exported between 00:00 and 09:00 on Tuesday are missed for the week, and the week before is not settled by that run.

## Root cause and fix

- **Cause:** the due-time offset after the window end is 1 day instead of 1 day 9 hours.
- **Fix (as in the corrected build):** the run for a window is due at Monday 00:00 + 1 day 9 hours (`RUN_OFFSET_MS` in `src/window.js`).
- **Blocked by:** TC-02 in `npm test` and `npm run e2e`; both evidence scripts expect it to fail on the faulty build.


---

# DEF-006: Timestamp offsets are ignored

| Field | Value |
|---|---|
| Component | Weekly rewards settlement (`src/settlement.buggy.js`, fictional sample) |
| Severity | **S2 / Major** |
| Priority | P1, blocks release |
| Rule broken | BR-3 |
| Status | Not present in `src/settlement.fixed.js`. Regression TC-05, UI-01 |

## Summary

The faulty build drops the offset from `completedAt` and reads the local wall-clock time as UTC. `2026-11-09T04:59:00+05:00` (Sun 23:59 UTC) is read as Mon 04:59 UTC. Tasks stamped near midnight in any non-UTC zone land in the wrong week.

## Steps to reproduce

1. In the browser: `npm start`, open http://localhost:4173/?impl=buggy, choose **TC-05** and select **Run scenario**. The banner shows `RULES BROKEN: BR-2, BR-3`. T-303 is paid and T-301 is excluded.
2. Automated: `npm run test:buggy` or `npm run e2e:buggy` (TC-05, UI-01 fail).

## Expected vs actual

| | Expected | Actual (faulty build) |
|---|---|---|
| T-301 at 04:59+05:00 (= Sun 08 Nov 23:59 UTC) | paid | **excluded** |
| T-303 at 03:00+05:00 on 2 Nov (= Sun 01 Nov 22:00 UTC) | excluded | **paid** |
| UI-01 T-CET-1 at 00:30+01:00 on 9 Nov (= Sun 23:30 UTC) | paid | **excluded** |

## Severity rationale

Users in non-UTC zones are paid in the wrong week, or not at all, for tasks near the cut-off. The number of users affected depends on how producers stamp times, so it's rated S2.

## Root cause and fix

- **Cause:** the timestamp is rewritten to end in `Z` before parsing, instead of parsing the ISO 8601 offset.
- **Fix (as in the corrected build):** parse the full ISO 8601 timestamp (`Date.parse` keeps the offset) and compare instants (`src/window.js`).
- **Blocked by:** TC-05, UI-01 in `npm test` and `npm run e2e`; both evidence scripts expect them to fail on the faulty build.


---

# DEF-007: In-progress tasks are paid

| Field | Value |
|---|---|
| Component | Weekly rewards settlement (`src/settlement.buggy.js`, fictional sample) |
| Severity | **S1 / Critical** |
| Priority | P1, blocks release |
| Rule broken | BR-4 |
| Status | Not present in `src/settlement.fixed.js`. Regression TC-06 |

## Summary

The faulty build excludes only `cancelled` tasks. Any other status, including `in_progress`, is paid. The rule is that only `completed` tasks qualify.

## Steps to reproduce

1. In the browser: `npm start`, open http://localhost:4173/?impl=buggy, choose **TC-06** and select **Run scenario**. The banner shows `RULES BROKEN: BR-2, BR-4`. T-401 (in_progress) is paid, acc-C has 10 and is notified.
2. Automated: `npm run test:buggy` or `npm run e2e:buggy` (TC-06 fails).

## Expected vs actual

| | Expected | Actual (faulty build) |
|---|---|---|
| T-401 (in_progress) | excluded | **paid 10 credits** |
| T-402 (cancelled) | excluded | **excluded** |
| acc-C balance / notifications | 0 / 0 | **10 / 1** |

## Severity rationale

Direct overpayment for work that was never finished, on every run, for every unfinished task in the window. Because payouts are keyed per task, the task is not paid again when it completes, so the early payment can't be noticed later.

## Root cause and fix

- **Cause:** the filter is a deny-list (`status === "cancelled"`) instead of an allow-list.
- **Fix (as in the corrected build):** only `status === "completed"` qualifies (`src/settlement.fixed.js`).
- **Blocked by:** TC-06 in `npm test` and `npm run e2e`; both evidence scripts expect it to fail on the faulty build.


---

# DEF-008: Only the first account in a run is notified

| Field | Value |
|---|---|
| Component | Weekly rewards settlement (`src/settlement.buggy.js`, fictional sample) |
| Severity | **S3 / Minor** |
| Priority | P2, fix before release |
| Rule broken | BR-6 |
| Status | Not present in `src/settlement.fixed.js`. Regression TC-03, TC-08 |

## Summary

The faulty build's notification loop returns after the first successful send instead of moving to the next account. Only the first account in each run is told about its payout. Others are notified on a later run, if one happens (TC-08).

## Steps to reproduce

1. In the browser: `npm start`, open http://localhost:4173/?impl=buggy, choose **TC-03** and select **Run scenario**. The banner shows `RULES BROKEN: BR-2, BR-6` (`acc-B has 10 credits for the week but was not notified`). acc-B has 0 notifications.
2. Automated: `npm run test:buggy` or `npm run e2e:buggy` (TC-03, TC-08 fail).

## Expected vs actual

| | Expected | Actual (faulty build) |
|---|---|---|
| TC-03 notifications | acc-A (20), acc-B (10) | **acc-A (20) only** |
| TC-08 acc-B notification | run 1 | **run 2 (the re-run), saying 10 while the ledger holds 20** |

## Severity rationale

Credits are paid correctly, but most users are never told. That drives support contacts. Rated S3 because no credits are lost.

## Root cause and fix

- **Cause:** `return` instead of `continue` after a successful send.
- **Fix (as in the corrected build):** notify every account with a payout in the run (`src/notifications.js`).
- **Blocked by:** TC-03, TC-08 in `npm test` and `npm run e2e`; both evidence scripts expect them to fail on the faulty build.
