# Playwright E2E summary

Generated 2026-11-21T07:12:09.748Z. Chromium, driven through the test bench UI.

| Case | Outcome asserted | Faulty build | Fixed build |
|---|---|---|---|
| TC-01 | the Tuesday 09:00 UTC run settles Mon 02 Nov 00:00 to Mon 09 Nov 00:00 UTC and pays the task inside it | FAIL | PASS |
| TC-02 | a run at Tue 08:59:59 UTC settles the previous week, paying a 30 Oct task and leaving a 4 Nov task | FAIL | PASS |
| TC-03 | happy path pays 10 credits per completed task and notifies each account once with its total | FAIL | PASS |
| TC-04 | a task at exactly Monday 00:00 (start) and one at the last millisecond are paid; one at the next Monday 00:00 is not | FAIL | PASS |
| TC-05 | +05:00 timestamps are converted to UTC, so only the one at Sun 08 Nov 23:59 UTC is paid | FAIL | PASS |
| TC-06 | in-progress and cancelled tasks earn nothing, create no ledger entry and trigger no notification | FAIL | PASS |
| TC-07 | the same task ID twice in one export is paid once: one ledger entry, 10 credits, the duplicate row skipped | FAIL | PASS |
| TC-08 | re-running the job for the same week pays nothing new and sends no second notification | FAIL | PASS |
| TC-09 | after T-702's ledger write fails, the retry pays only T-702 and the account ends on 30 credits | FAIL | PASS |
| TC-10 | a task paid in the 2-9 Nov run and re-sent in the 9-16 Nov export is not paid or notified again | FAIL | PASS |
| TC-11 | a failed notification is reported and the 10-credit payout stays | FAIL | PASS |
| TC-12 | when the account's only payout fails, no credits are recorded and no notification is sent | FAIL | PASS |
| TC-13 | after a failed notification, the re-run delivers it once and neither re-run pays again | FAIL | PASS |
| UI-01 | a custom task at 00:30 +01:00 on Mon 09 Nov counts as Sun 08 Nov 23:30 UTC and is paid; one at 00:30 +01:00 on Mon 02 Nov is not | FAIL | PASS |
| UI-02 | an invalid completed-at time is rejected with its exact message and nothing is settled | PASS | PASS |

- Faulty build failures: TC-01, TC-02, TC-03, TC-04, TC-05, TC-06, TC-07, TC-08, TC-09, TC-10, TC-11, TC-12, TC-13, UI-01 (expected TC-01, TC-02, TC-03, TC-04, TC-05, TC-06, TC-07, TC-08, TC-09, TC-10, TC-11, TC-12, TC-13, UI-01)
- Fixed build not passing: none
- Verdict: PASS: the E2E regression detects DEF-001..DEF-008 and the fix resolves them

HTML reports: `results/e2e-report-buggy/index.html`, `results/e2e-report-fixed/index.html` (open with `npx playwright show-report results/e2e-report-buggy`).
