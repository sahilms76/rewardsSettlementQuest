import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { IMPL, settlementWindow } from "../src/index.js";
import {
  newEnv, task, RUN_AT, NEXT_RUN_AT, WINDOW_START, WINDOW_END, NEXT_WINDOW_START,
} from "./fixtures.js";

describe(`settlement window [impl=${IMPL}]`, () => {
  test("TC-01: run at Tue 09:00 UTC settles the previous Monday 00:00 to this Monday 00:00 UTC", () => {
    const w = settlementWindow(RUN_AT);
    assert.deepEqual(
      { start: w.start.toISOString(), end: w.end.toISOString() },
      { start: WINDOW_START, end: WINDOW_END },
    );
  });

  test("TC-02: run at Tue 08:59:59 UTC is before the cut-off and settles the window one week earlier", () => {
    const w = settlementWindow(new Date("2026-11-10T08:59:59Z"));
    assert.deepEqual(
      { start: w.start.toISOString(), end: w.end.toISOString() },
      { start: "2026-10-26T00:00:00.000Z", end: "2026-11-02T00:00:00.000Z" },
    );
  });
});

describe(`settlement payouts [impl=${IMPL}]`, () => {
  test("TC-03: happy path pays 10 credits per completed task and notifies each account once with its total", async () => {
    const env = newEnv();
    await env.run([
      task("T-101", "acc-A", "2026-11-03T10:00:00Z"),
      task("T-102", "acc-A", "2026-11-05T15:30:00Z"),
      task("T-103", "acc-B", "2026-11-06T08:00:00Z"),
    ]);
    assert.deepEqual(
      { A: env.ledger.balance("acc-A"), B: env.ledger.balance("acc-B"), entries: env.ledger.entries.length },
      { A: 20, B: 10, entries: 3 },
    );
    assert.deepEqual(env.notifier.sent, [
      { accountId: "acc-A", windowStart: WINDOW_START, credits: 20 },
      { accountId: "acc-B", windowStart: WINDOW_START, credits: 10 },
    ]);
  });

  test("TC-04: cut-off boundary pays a task at exactly Monday 00:00 (start) and the last ms before the end, but not one at the end", async () => {
    const env = newEnv();
    const report = await env.run([
      task("T-201", "acc-A", "2026-11-02T00:00:00.000Z"),
      task("T-202", "acc-A", "2026-11-08T23:59:59.999Z"),
      task("T-203", "acc-A", "2026-11-09T00:00:00.000Z"),
    ]);
    assert.deepEqual(
      { paid: report.paid, excluded: report.excluded, balance: env.ledger.balance("acc-A") },
      { paid: ["T-201", "T-202"], excluded: ["T-203"], balance: 20 },
    );
  });

  test("TC-05: timestamps with a +05:00 offset are converted to UTC before the window check", async () => {
    const env = newEnv();
    const report = await env.run([
      task("T-301", "acc-A", "2026-11-09T04:59:00+05:00"),
      task("T-302", "acc-A", "2026-11-09T05:00:00+05:00"),
      task("T-303", "acc-A", "2026-11-02T03:00:00+05:00"),
    ]);
    assert.deepEqual(
      { paid: report.paid, excluded: report.excluded, balance: env.ledger.balance("acc-A") },
      { paid: ["T-301"], excluded: ["T-302", "T-303"], balance: 10 },
    );
  });

  test("TC-06: tasks that are not completed earn nothing and trigger no notification", async () => {
    const env = newEnv();
    const report = await env.run([
      task("T-401", "acc-C", "2026-11-04T12:00:00Z", "in_progress"),
      task("T-402", "acc-C", "2026-11-04T13:00:00Z", "cancelled"),
    ]);
    assert.deepEqual(
      { paid: report.paid, balance: env.ledger.balance("acc-C"), notified: env.notifier.sentTo("acc-C").length },
      { paid: [], balance: 0, notified: 0 },
    );
  });
});

describe(`DEF-001 duplicate payout regression [impl=${IMPL}]`, () => {
  test("TC-07: the same task ID twice in one batch is paid once (10 credits, one ledger entry)", async () => {
    const env = newEnv();
    const report = await env.run([
      task("T-501", "acc-A", "2026-11-04T09:00:00Z"),
      task("T-501", "acc-A", "2026-11-04T09:00:00Z"),
    ]);
    assert.deepEqual(
      {
        entriesForTask: env.ledger.entriesForTask("T-501").length,
        balance: env.ledger.balance("acc-A"),
        notifiedCredits: env.notifier.sentTo("acc-A").map((m) => m.credits),
      },
      { entriesForTask: 1, balance: 10, notifiedCredits: [10] },
    );
    assert.deepEqual(report.duplicatesInInput, ["T-501"]);
  });

  test("TC-08: re-running the whole settlement for the same window pays nothing new and sends no second notification", async () => {
    const env = newEnv();
    const tasks = [
      task("T-601", "acc-A", "2026-11-03T10:00:00Z"),
      task("T-602", "acc-B", "2026-11-04T10:00:00Z"),
    ];
    await env.run(tasks);
    const retry = await env.run(tasks);
    assert.deepEqual(
      {
        entries: env.ledger.entries.length,
        A: env.ledger.balance("acc-A"),
        B: env.ledger.balance("acc-B"),
        retryPaid: retry.paid,
        retryAlreadyPaid: retry.alreadyPaid,
        notifications: env.notifier.sent.length,
      },
      { entries: 2, A: 10, B: 10, retryPaid: [], retryAlreadyPaid: ["T-601", "T-602"], notifications: 2 },
    );
  });

  test("TC-09: a retry after a partial ledger failure pays only the failed task, never the ones already paid", async () => {
    const env = newEnv();
    const tasks = [
      task("T-701", "acc-A", "2026-11-03T10:00:00Z"),
      task("T-702", "acc-A", "2026-11-03T11:00:00Z"),
      task("T-703", "acc-A", "2026-11-03T12:00:00Z"),
    ];
    env.ledger.failOnceFor("T-702");
    const first = await env.run(tasks);
    const retry = await env.run(tasks);
    assert.deepEqual(
      {
        firstPaid: first.paid,
        firstFailed: first.payoutFailures.map((f) => f.taskId),
        retryPaid: retry.paid,
        perTaskEntries: ["T-701", "T-702", "T-703"].map((id) => env.ledger.entriesForTask(id).length),
        balance: env.ledger.balance("acc-A"),
      },
      { firstPaid: ["T-701", "T-703"], firstFailed: ["T-702"], retryPaid: ["T-702"], perTaskEntries: [1, 1, 1], balance: 30 },
    );
  });

  test("TC-10: a task already paid last week and re-sent in next week's export is not paid again", async () => {
    const env = newEnv();
    await env.run([task("T-801", "acc-D", "2026-11-05T10:00:00Z")], RUN_AT);
    const nextWeek = await env.run([task("T-801", "acc-D", "2026-11-10T10:00:00Z")], NEXT_RUN_AT);
    assert.deepEqual(
      {
        entriesForTask: env.ledger.entriesForTask("T-801").length,
        balance: env.ledger.balance("acc-D"),
        nextWeekPaid: nextWeek.paid,
        nextWeekNotifications: env.notifier.sent.filter((m) => m.windowStart === NEXT_WINDOW_START).length,
      },
      { entriesForTask: 1, balance: 10, nextWeekPaid: [], nextWeekNotifications: 0 },
    );
  });
});

describe(`notification partial failure [impl=${IMPL}]`, () => {
  test("TC-11: a notification failure is reported and does not reverse the payout", async () => {
    const env = newEnv();
    env.notifier.failNext(1);
    const report = await env.run([task("T-901", "acc-E", "2026-11-04T10:00:00Z")]);
    assert.deepEqual(
      {
        balance: env.ledger.balance("acc-E"),
        delivered: env.notifier.sent.length,
        failures: report.notificationFailures.map((f) => f.accountId),
        logState: env.notificationLog.get(`notify:acc-E:${WINDOW_START}`),
      },
      { balance: 10, delivered: 0, failures: ["acc-E"], logState: "failed" },
    );
  });

  test("TC-12: no notification is sent when the account's only payout failed", async () => {
    const env = newEnv();
    env.ledger.failOnceFor("T-1001");
    const report = await env.run([task("T-1001", "acc-F", "2026-11-04T10:00:00Z")]);
    assert.deepEqual(
      {
        balance: env.ledger.balance("acc-F"),
        notified: env.notifier.sentTo("acc-F").length,
        payoutFailures: report.payoutFailures.map((f) => f.taskId),
      },
      { balance: 0, notified: 0, payoutFailures: ["T-1001"] },
    );
  });

  test("TC-13: after a failed notification, the retry run delivers it exactly once and pays nothing extra", async () => {
    const env = newEnv();
    const tasks = [task("T-1101", "acc-G", "2026-11-04T10:00:00Z")];
    env.notifier.failNext(1);
    await env.run(tasks);
    await env.run(tasks);
    await env.run(tasks);
    assert.deepEqual(
      { balance: env.ledger.balance("acc-G"), sent: env.notifier.sentTo("acc-G") },
      { balance: 10, sent: [{ accountId: "acc-G", windowStart: WINDOW_START, credits: 10 }] },
    );
  });
});
