# Test cases and results

Window under test: **Mon 2026-11-02 00:00Z to Mon 2026-11-09 00:00Z (end excluded)**, settled by the run on **Tue 2026-11-10 09:00Z**. 1 qualifying task = 10 credits. All data is fictional. Each case runs in a fresh ledger, notifier and notification log (no shared state).

Each case is automated twice and can be run by hand:

- **Unit** (node:test): [`test/settlement.test.js`](../test/settlement.test.js). Results: [`results/summary.md`](../results/summary.md)
- **E2E** (Playwright through the UI): [`e2e/settlement.spec.ts`](../e2e/settlement.spec.ts). Results: [`results/e2e-summary.md`](../results/e2e-summary.md)
- **Manual**: `npm start`, pick the case in the Scenario list (one file per case in [`manual/`](../manual/index.json)), choose Fixed or Buggy, and select Run scenario

The faulty and fixed results below are the same at both levels.

| ID | Category | Input | Expected outcome | Faulty build (defect · rule) | Fixed build |
|---|---|---|---|---|---|
| TC-01 | Happy path (window) | Run at `2026-11-10T09:00:00Z` | Window `[2026-11-02T00:00Z, 2026-11-09T00:00Z)` | **FAIL**: window ends Sun 08 Nov 23:59:59 with the end included (DEF-004 · BR-2) | PASS |
| TC-02 | Cut-off (run time) | Run at `2026-11-10T08:59:59Z` | Not due yet: settles `[2026-10-26, 2026-11-02)` | **FAIL**: settles 2–9 Nov, pays T-022 and leaves T-021 (DEF-005 · BR-1) | PASS |
| TC-03 | Happy path | T-101, T-102 (acc-A), T-103 (acc-B), all completed in window | acc-A 20, acc-B 10, 3 ledger entries; one notification each with 20 and 10 | **FAIL**: acc-B is paid 10 but never notified (DEF-008 · BR-6) | PASS |
| TC-04 | Cut-off boundary | completedAt `…02T00:00:00.000Z`, `…08T23:59:59.999Z`, `…09T00:00:00.000Z` | First two paid, the third excluded (belongs to next week); balance 20 | **FAIL**: T-202 at 23:59:59.999 is not paid; balance 10 (DEF-004 · BR-2) | PASS |
| TC-05 | Timezone conversion | `2026-11-09T04:59+05:00` (=Sun 23:59Z), `2026-11-09T05:00+05:00` (=Mon 00:00Z), `2026-11-02T03:00+05:00` (=Sun 01 Nov 22:00Z) | Only the first paid; balance 10 | **FAIL**: pays T-303 instead of T-301 (DEF-006 · BR-3) | PASS |
| TC-06 | Filter | `in_progress` and `cancelled` tasks in window | 0 credits, no notification | **FAIL**: in-progress T-401 is paid 10 and notified (DEF-007 · BR-4) | PASS |
| TC-07 | Duplicate input | T-501 twice in the same batch | One ledger entry, 10 credits, notification says 10 | **FAIL**: 2 entries, 20 credits (DEF-001 · BR-5) | PASS |
| TC-08 | Retry (full job) | Same batch settled twice | Still 2 entries, 10 each; retry reports both as already paid; no second notification | **FAIL**: 4 entries, 20 each; acc-B only notified on the re-run (DEF-001, DEF-008 · BR-5, BR-6) | PASS |
| TC-09 | Retry after partial failure | Ledger write for T-702 fails once; job re-run | Run 1 pays T-701, T-703; retry pays only T-702; one entry per task, balance 30 | **FAIL**: T-701/T-703 paid twice; told 30 credits when 20 were paid (DEF-001, DEF-003 · BR-5, BR-6) | PASS |
| TC-10 | Duplicate across weeks | T-801 paid in week 1, re-sent in week 2 export with a later completedAt | Not paid again; no week-2 notification | **FAIL**: paid twice (DEF-001 · BR-5) | PASS |
| TC-11 | Partial failure (notification) | Notifier fails once | Payout of 10 stays; failure reported; log = `failed` | **FAIL**: payout reversed, 0 credits, no ledger entry (DEF-002 · BR-7) | PASS |
| TC-12 | Notify only after payout | Account's only payout write fails | 0 credits, no notification, payout failure reported | **FAIL**: told it earned 10 credits with balance 0 (DEF-003 · BR-6) | PASS |
| TC-13 | Retry after notification failure | Notifier fails on run 1; job re-run twice | Notification delivered exactly once (10 credits); balance stays 10 | **FAIL**: run 1 payout reversed, then each re-run pays again: 20 (DEF-001, DEF-002 · BR-5, BR-7) | PASS |
| UI-01 | Manual input, timezone (E2E only) | Custom scenario: T-CET-1 at `2026-11-09T00:30:00+01:00`, T-CET-2 at `2026-11-02T00:30:00+01:00` | UI shows `= Sun 08 Nov 2026 23:30 UTC` and `= Sun 01 Nov 2026 23:30 UTC`; T-CET-1 paid, T-CET-2 excluded; balance 10 | **FAIL**: pays T-CET-2 instead of T-CET-1 (DEF-006 · BR-3) | PASS |
| UI-02 | Invalid input, negative (E2E only) | Custom task with completedAt `not-a-date` | Exact message `Task T-NEW-1: completed at is not a valid ISO 8601 time.`; nothing settled | PASS (input validation is in the UI, not in the build) | PASS |

The faulty build fails every case, at both unit and E2E level, and each case names the defect that causes it. The test bench's rule check (Scenario result and the "Broken rules" column in Run all cases) shows which business rule each failure breaks. DEF-004's window is used by every faulty run, so BR-2 is listed on every faulty case as well. The table above names each case's main defect. UI-01 and UI-02 test the test bench's manual input and exist only in the Playwright suite.

## Assumptions

| Area | Assumption |
|---|---|
| Task identity | `taskId` is globally unique and is the payout identity. A task is paid at most once, ever, even if re-delivered in a later week (TC-10). |
| Source of truth for timing | `completedAt` as an ISO 8601 instant; any offset is converted to UTC. A timestamp without an offset is rejected upstream (not in scope). |
| Scheduler | At-least-once: a run can repeat for the same window (automatic retry or manual re-run). A run before Tue 09:00 UTC settles the previous window (TC-02). |
| Credits per task | Admin setting fixed at 10 for the run. A change takes effect from the next run and is never applied retroactively to paid tasks (not tested, see gaps). |
| Account changes | Closed, suspended or merged accounts are out of scope: the sample pays the account named on the task. A real service needs a rule (hold, skip or pay) before release (gap G2). |
| Notification | One per account per window, stating the total credits for that window. A failed one is retried on the next run; a delivered one is never re-sent. |
| Partial ledger failure | One failed write doesn't stop the batch; the task is picked up by the next run. |
