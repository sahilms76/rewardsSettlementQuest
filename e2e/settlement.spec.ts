import { test, expect, IMPL } from "./fixtures";

const OK = "OK: no business rule broken";
const WEEK_2_TO_9_NOV = "Mon 02 Nov 2026 00:00 UTC to Mon 09 Nov 2026 00:00 UTC (end excluded)";

test.describe(`Settlement window and qualification [${IMPL} build]`, () => {
  test("TC-01: the Tuesday 09:00 UTC run settles Mon 02 Nov 00:00 to Mon 09 Nov 00:00 UTC and pays the task inside it", async ({ bench }) => {
    await bench.runScenario("TC-01");
    await expect.soft(bench.ruleCheck).toHaveText(OK);
    await expect.soft(bench.runField(1, "window")).toHaveText(WEEK_2_TO_9_NOV);
    await expect.soft(bench.runField(1, "paid")).toHaveText("T-001");
    await expect.soft(bench.balance("acc-A")).toHaveText("10");
  });

  test("TC-02: a run at Tue 08:59:59 UTC settles the previous week, paying a 30 Oct task and leaving a 4 Nov task", async ({ bench }) => {
    await bench.runScenario("TC-02");
    await expect.soft(bench.ruleCheck).toHaveText(OK);
    await expect.soft(bench.runAtHint).toHaveText("= Tue 10 Nov 2026 08:59:59 UTC");
    await expect.soft(bench.runField(1, "window")).toHaveText(
      "Mon 26 Oct 2026 00:00 UTC to Mon 02 Nov 2026 00:00 UTC (end excluded)",
    );
    await expect.soft(bench.runField(1, "paid")).toHaveText("T-021");
    await expect.soft(bench.runField(1, "excluded")).toHaveText("T-022");
    await expect.soft(bench.balance("acc-A")).toHaveText("10");
  });

  test("TC-03: happy path pays 10 credits per completed task and notifies each account once with its total", async ({ bench }) => {
    await bench.runScenario("TC-03");
    await expect.soft(bench.ruleCheck).toHaveText(OK);
    await expect.soft(bench.runField(1, "paid")).toHaveText("T-101, T-102, T-103");
    await expect.soft(bench.balance("acc-A")).toHaveText("20");
    await expect.soft(bench.balance("acc-B")).toHaveText("10");
    await expect.soft(bench.runField(1, "notifications-sent")).toHaveText("acc-A (20 credits), acc-B (10 credits)");
    await expect.soft(bench.notifications("acc-A")).toHaveText("1");
    await expect.soft(bench.notifications("acc-B")).toHaveText("1");
  });

  test("TC-04: a task at exactly Monday 00:00 (start) and one at the last millisecond are paid; one at the next Monday 00:00 is not", async ({ bench }) => {
    await bench.runScenario("TC-04");
    await expect.soft(bench.ruleCheck).toHaveText(OK);
    await expect.soft(bench.runField(1, "paid")).toHaveText("T-201, T-202");
    await expect.soft(bench.runField(1, "excluded")).toHaveText("T-203");
    await expect.soft(bench.balance("acc-A")).toHaveText("20");
  });

  test("TC-05: +05:00 timestamps are converted to UTC, so only the one at Sun 08 Nov 23:59 UTC is paid", async ({ bench }) => {
    await bench.runScenario("TC-05");
    await expect.soft(bench.ruleCheck).toHaveText(OK);
    await expect.soft(bench.task(0).utc).toHaveText("= Sun 08 Nov 2026 23:59 UTC");
    await expect.soft(bench.task(1).utc).toHaveText("= Mon 09 Nov 2026 00:00 UTC");
    await expect.soft(bench.task(2).utc).toHaveText("= Sun 01 Nov 2026 22:00 UTC");
    await expect.soft(bench.runField(1, "paid")).toHaveText("T-301");
    await expect.soft(bench.runField(1, "excluded")).toHaveText("T-302, T-303");
    await expect.soft(bench.balance("acc-A")).toHaveText("10");
  });

  test("TC-06: in-progress and cancelled tasks earn nothing, create no ledger entry and trigger no notification", async ({ bench }) => {
    await bench.runScenario("TC-06");
    await expect.soft(bench.ruleCheck).toHaveText(OK);
    await expect.soft(bench.runField(1, "paid")).toHaveText("none");
    await expect.soft(bench.runField(1, "excluded")).toHaveText("T-401, T-402");
    await expect.soft(bench.balance("acc-C")).toHaveText("0");
    await expect.soft(bench.notifications("acc-C")).toHaveText("0");
    await expect.soft(bench.entriesEmpty).toHaveText("No ledger entries.");
  });
});

test.describe(`DEF-001 duplicate payout [${IMPL} build]`, () => {
  test("TC-07: the same task ID twice in one export is paid once: one ledger entry, 10 credits, the duplicate row skipped", async ({ bench }) => {
    await bench.runScenario("TC-07");
    await expect.soft(bench.ruleCheck).toHaveText(OK);
    await expect.soft(bench.entries("T-501")).toHaveText("1");
    await expect.soft(bench.balance("acc-A")).toHaveText("10");
    await expect.soft(bench.runField(1, "duplicates")).toHaveText("T-501");
    await expect.soft(bench.runField(1, "notifications-sent")).toHaveText("acc-A (10 credits)");
  });

  test("TC-08: re-running the job for the same week pays nothing new and sends no second notification", async ({ bench }) => {
    await bench.runScenario("TC-08");
    await expect.soft(bench.ruleCheck).toHaveText(OK);
    await expect.soft(bench.runField(2, "paid")).toHaveText("none");
    await expect.soft(bench.runField(2, "already-paid")).toHaveText("T-601, T-602");
    await expect.soft(bench.runField(2, "notifications-sent")).toHaveText("none");
    await expect.soft(bench.balance("acc-A")).toHaveText("10");
    await expect.soft(bench.balance("acc-B")).toHaveText("10");
    await expect.soft(bench.entries("T-601")).toHaveText("1");
    await expect.soft(bench.entries("T-602")).toHaveText("1");
  });

  test("TC-09: after T-702's ledger write fails, the retry pays only T-702 and the account ends on 30 credits", async ({ bench }) => {
    await bench.runScenario("TC-09");
    await expect.soft(bench.ruleCheck).toHaveText(OK);
    await expect.soft(bench.runField(1, "paid")).toHaveText("T-701, T-703");
    await expect.soft(bench.runField(1, "payout-failures")).toHaveText("T-702");
    await expect.soft(bench.runField(2, "paid")).toHaveText("T-702");
    await expect.soft(bench.runField(2, "already-paid")).toHaveText("T-701, T-703");
    for (const id of ["T-701", "T-702", "T-703"]) await expect.soft(bench.entries(id)).toHaveText("1");
    await expect.soft(bench.balance("acc-A")).toHaveText("30");
  });

  test("TC-10: a task paid in the 2-9 Nov run and re-sent in the 9-16 Nov export is not paid or notified again", async ({ bench }) => {
    await bench.runScenario("TC-10");
    await expect.soft(bench.ruleCheck).toHaveText(OK);
    await expect.soft(bench.runField(2, "window")).toHaveText(
      "Mon 09 Nov 2026 00:00 UTC to Mon 16 Nov 2026 00:00 UTC (end excluded)",
    );
    await expect.soft(bench.runField(2, "paid")).toHaveText("none");
    await expect.soft(bench.runField(2, "already-paid")).toHaveText("T-801");
    await expect.soft(bench.runField(2, "notifications-sent")).toHaveText("none");
    await expect.soft(bench.entries("T-801")).toHaveText("1");
    await expect.soft(bench.balance("acc-D")).toHaveText("10");
  });
});

test.describe(`Notification partial failure [${IMPL} build]`, () => {
  test("TC-11: a failed notification is reported and the 10-credit payout stays", async ({ bench }) => {
    await bench.runScenario("TC-11");
    await expect.soft(bench.ruleCheck).toHaveText(OK);
    await expect.soft(bench.runField(1, "paid")).toHaveText("T-901");
    await expect.soft(bench.runField(1, "notification-failures")).toHaveText("acc-E");
    await expect.soft(bench.runField(1, "notifications-sent")).toHaveText("none");
    await expect.soft(bench.balance("acc-E")).toHaveText("10");
    await expect.soft(bench.notifications("acc-E")).toHaveText("0");
  });

  test("TC-12: when the account's only payout fails, no credits are recorded and no notification is sent", async ({ bench }) => {
    await bench.runScenario("TC-12");
    await expect.soft(bench.ruleCheck).toHaveText(OK);
    await expect.soft(bench.runField(1, "payout-failures")).toHaveText("T-1001");
    await expect.soft(bench.runField(1, "notifications-sent")).toHaveText("none");
    await expect.soft(bench.balance("acc-F")).toHaveText("0");
    await expect.soft(bench.notifications("acc-F")).toHaveText("0");
  });

  test("TC-13: after a failed notification, the re-run delivers it once and neither re-run pays again", async ({ bench }) => {
    await bench.runScenario("TC-13");
    await expect.soft(bench.ruleCheck).toHaveText(OK);
    await expect.soft(bench.runField(1, "notification-failures")).toHaveText("acc-G");
    await expect.soft(bench.runField(2, "notifications-sent")).toHaveText("acc-G (10 credits)");
    await expect.soft(bench.runField(2, "paid")).toHaveText("none");
    await expect.soft(bench.runField(3, "paid")).toHaveText("none");
    await expect.soft(bench.runField(3, "notifications-sent")).toHaveText("none");
    await expect.soft(bench.entries("T-1101")).toHaveText("1");
    await expect.soft(bench.balance("acc-G")).toHaveText("10");
    await expect.soft(bench.notifications("acc-G")).toHaveText("1");
  });
});

test.describe(`Manual input in the test bench [${IMPL} build]`, () => {
  test("UI-01: a custom task at 00:30 +01:00 on Mon 09 Nov counts as Sun 08 Nov 23:30 UTC and is paid; one at 00:30 +01:00 on Mon 02 Nov is not", async ({ bench }) => {
    await bench.selectScenario("Custom");
    await bench.addTask.click();
    await bench.addTask.click();
    const inWeek = bench.task(0);
    await inWeek.taskId.fill("T-CET-1");
    await inWeek.account.fill("acc-Z");
    await inWeek.completedAt.fill("2026-11-09T00:30:00+01:00");
    const beforeWeek = bench.task(1);
    await beforeWeek.taskId.fill("T-CET-2");
    await beforeWeek.account.fill("acc-Z");
    await beforeWeek.completedAt.fill("2026-11-02T00:30:00+01:00");
    await bench.run();

    await expect.soft(bench.ruleCheck).toHaveText(OK);
    await expect.soft(inWeek.utc).toHaveText("= Sun 08 Nov 2026 23:30 UTC");
    await expect.soft(beforeWeek.utc).toHaveText("= Sun 01 Nov 2026 23:30 UTC");
    await expect.soft(bench.runField(1, "paid")).toHaveText("T-CET-1");
    await expect.soft(bench.runField(1, "excluded")).toHaveText("T-CET-2");
    await expect.soft(bench.balance("acc-Z")).toHaveText("10");
    await expect.soft(bench.expectCheck).toHaveText(
      "Custom or edited input: no expected outcome to compare. Check the values below against the rules.",
    );
  });

  test("UI-02: an invalid completed-at time is rejected with its exact message and nothing is settled", async ({ bench }) => {
    await bench.selectScenario("Custom");
    await bench.addTask.click();
    await bench.task(0).completedAt.fill("not-a-date");
    await bench.run();

    await expect.soft(bench.task(0).utc).toHaveText("Not a valid ISO 8601 time");
    await expect.soft(bench.inputError).toContainText("Task T-NEW-1: completed at is not a valid ISO 8601 time.");
    await expect.soft(bench.ruleCheck).toHaveCount(0);
    await expect.soft(bench.page.getByTestId("run-1")).toHaveCount(0);
  });
});
