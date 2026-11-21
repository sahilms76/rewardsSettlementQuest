# Test cases and results

Window under test: **Mon 2026-11-02 00:00Z to Mon 2026-11-09 00:00Z (end excluded)**, settled by the run on **Tue 2026-11-10 09:00Z**. 1 qualifying task = 10 credits. All data is fictional. Each case runs in a fresh ledger, notifier and notification log (no shared state).

Each case is automated twice and can be run by hand:

- **Unit** (node:test): [`test/settlement.test.js`](../test/settlement.test.js). Results: [`results/summary.md`](../results/summary.md)
- **E2E** (Playwright through the UI): [`e2e/settlement.spec.ts`](../e2e/settlement.spec.ts). Results: [`results/e2e-summary.md`](../results/e2e-summary.md)
- **Manual**: `npm start`, pick the case in the Scenario list (one file per case in [`manual/`](../manual/index.json)), choose Fixed or Buggy, and select Run scenario

The faulty and fixed results below are the same at both levels.

| ID | Category | Input | Expected outcome | Faulty build (DEF-001 only) | Fixed build |
|---|---|---|---|---|---|
| TC-01 | Happy path (window) | Run at `2026-11-10T09:00:00Z` | Window `[2026-11-02T00:00Z, 2026-11-09T00:00Z)` | PASS (control) | PASS |
| TC-02 | Cut-off (run time) | Run at `2026-11-10T08:59:59Z` | Not due yet: settles `[2026-10-26, 2026-11-02)` | PASS (control) | PASS |
| TC-03 | Happy path | T-101, T-102 (acc-A), T-103 (acc-B), all completed in window | acc-A 20, acc-B 10, 3 ledger entries; one notification each with 20 and 10 | PASS (control) | PASS |
| TC-04 | Cut-off boundary | completedAt `…02T00:00:00.000Z`, `…08T23:59:59.999Z`, `…09T00:00:00.000Z` | First two paid, the third excluded (belongs to next week); balance 20 | PASS (control) | PASS |
| TC-05 | Timezone conversion | `2026-11-09T04:59+05:00` (=Sun 23:59Z), `2026-11-09T05:00+05:00` (=Mon 00:00Z), `2026-11-02T03:00+05:00` (=Sun 01 Nov 22:00Z) | Only the first paid; balance 10 | PASS (control) | PASS |
| TC-06 | Filter | `in_progress` and `cancelled` tasks in window | 0 credits, no notification | PASS (control) | PASS |
| TC-07 | Duplicate input | T-501 twice in the same batch | One ledger entry, 10 credits, notification says 10 | **FAIL**: 2 entries, 20 credits (BR-5) | PASS |
| TC-08 | Retry (full job) | Same batch settled twice | Still 2 entries, 10 each; retry reports both as already paid; no second notification | **FAIL**: 4 entries, 20 each (BR-5) | PASS |
| TC-09 | Retry after partial failure | Ledger write for T-702 fails once; job re-run | Run 1 pays T-701, T-703; retry pays only T-702; one entry per task, balance 30 | **FAIL**: T-701 and T-703 paid twice, balance 50 (BR-5) | PASS |
| TC-10 | Duplicate across weeks | T-801 paid in week 1, re-sent in week 2 export with a later completedAt | Not paid again; no week-2 notification | **FAIL**: paid twice, 20 credits (BR-5) | PASS |
| TC-11 | Partial failure (notification) | Notifier fails once | Payout of 10 stays; failure reported; log = `failed` | PASS (control) | PASS |
| TC-12 | Notify only after payout | Account's only payout write fails | 0 credits, no notification, payout failure reported | PASS (control) | PASS |
| TC-13 | Retry after notification failure | Notifier fails on run 1; job re-run twice | Notification delivered exactly once (10 credits); balance stays 10 | **FAIL**: each re-run pays again, 30 credits after two re-runs (BR-5) | PASS |
| UI-01 | Manual input, timezone (E2E only) | Custom scenario: T-CET-1 at `2026-11-09T00:30:00+01:00`, T-CET-2 at `2026-11-02T00:30:00+01:00` | UI shows `= Sun 08 Nov 2026 23:30 UTC` and `= Sun 01 Nov 2026 23:30 UTC`; T-CET-1 paid, T-CET-2 excluded; balance 10 | PASS (control) | PASS |
| UI-02 | Invalid input, negative (E2E only) | Custom task with completedAt `not-a-date` | Exact message `Task T-NEW-1: completed at is not a valid ISO 8601 time.`; nothing settled | PASS (input validation is in the UI, not in the build) | PASS |

The faulty build differs from the fixed one only in DEF-001 (duplicate payout), so exactly the duplicate and retry cases fail: TC-07, TC-08, TC-09, TC-10 and TC-13, each on BR-5 alone. The other cases pass on both builds and act as controls: they show the suite fails for DEF-001 and for nothing else, and they guard the other ranked risks (window boundary, timezone, notification rules) against future regressions. UI-01 and UI-02 test the test bench's manual input and exist only in the Playwright suite. All data is synthetic.

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
