import * as fixed from "./settlement.fixed.js";
import * as buggy from "./settlement.buggy.js";
import { InMemoryLedger } from "./ledger.js";
import { FakeNotifier } from "./notifier.js";
import { settlementWindow, inWindow } from "./window.js";

export const IMPLEMENTATIONS = { fixed: fixed.settle, buggy: buggy.settle };

export function plannedRuns(scenario) {
  const count = Math.max(1, Number(scenario.runs ?? 1));
  const runs = Array.from({ length: count }, () => ({ runAt: scenario.runAt, tasks: scenario.tasks ?? [] }));
  if (scenario.nextWeek) runs.push({ runAt: scenario.nextWeek.runAt, tasks: scenario.nextWeek.tasks ?? [] });
  return runs;
}

export const RULES = {
  "BR-1": "A run before Tuesday 09:00 UTC settles the previous window; from 09:00 it settles the week that just ended.",
  "BR-2": "The window is previous Monday 00:00 UTC to following Monday 00:00 UTC: start included, end excluded.",
  "BR-3": "Timestamps are compared as instants: any offset is converted to UTC first.",
  "BR-4": "Only completed tasks qualify.",
  "BR-5": "A task ID is paid at most once, across duplicates, retries and later weeks.",
  "BR-6": "Every account with a successful payout is notified, only such accounts are, and the message states the window total from the ledger.",
  "BR-7": "A notification failure never reverses a payout, and a delivered notification is never re-sent.",
};

const short = (iso) => iso.replace(":00.000Z", "Z").replace(".000Z", "Z");
const hasOffset = (iso) => /[+-]\d{2}:?\d{2}$/.test(iso) && !/[+-]00:?00$/.test(iso);

function checkRunRules(label, run, report, ledger, notificationLog, violations) {
  const { runAt, tasks } = run;
  const due = settlementWindow(new Date(runAt));
  const dueStart = due.start.toISOString();
  const dueEnd = due.end.toISOString();
  const wrongWeek = report.window.start !== dueStart;
  if (wrongWeek) {
    violations["BR-1"].push(`${label} at ${short(runAt)} settled the week from ${short(report.window.start)}; the due week starts ${short(dueStart)}`);
  } else if (report.window.end !== dueEnd || report.window.endIncluded) {
    violations["BR-2"].push(`Window from ${short(report.window.start)} ends ${short(report.window.end)} (end ${report.window.endIncluded ? "included" : "excluded"}); it must end ${short(dueEnd)} (end excluded)`);
  }

  const excluded = new Set(report.excluded);
  for (const t of tasks) {
    const qualifies = t.status === "completed" && inWindow(t.completedAt, due);
    const treated = !excluded.has(t.taskId);
    if (qualifies === treated) continue;
    const what = treated ? "was paid but should not be" : "was excluded but qualifies";
    if (t.status !== "completed" && treated) {
      violations["BR-4"].push(`${label}: ${t.taskId} (${t.status}) was paid`);
    } else if (wrongWeek) {
      violations["BR-1"].push(`${label}: ${t.taskId} ${what} (wrong week settled)`);
    } else if (hasOffset(t.completedAt)) {
      const utc = short(new Date(t.completedAt).toISOString());
      violations["BR-3"].push(`${label}: ${t.taskId} at ${t.completedAt} (= ${utc}) ${what}`);
    } else {
      violations["BR-2"].push(`${label}: ${t.taskId} at ${short(t.completedAt)} ${what}`);
    }
  }

  for (const m of report.notificationsSent) {
    const inLedger = ledger.creditsFor(m.accountId, report.window.start);
    if (m.credits !== inLedger) {
      violations["BR-6"].push(`${label}: ${m.accountId} told ${m.credits} credits, ledger has ${inLedger}`);
    }
  }
  const notifyFailed = new Set(report.notificationFailures.map((f) => f.accountId));
  for (const accountId of new Set(tasks.map((t) => t.accountId))) {
    const credits = ledger.creditsFor(accountId, report.window.start);
    const delivered = notificationLog.get(`notify:${accountId}:${report.window.start}`) === "delivered";
    if (credits > 0 && !delivered && !notifyFailed.has(accountId)) {
      violations["BR-6"].push(`${label}: ${accountId} has ${credits} credits for the week but was not notified`);
    }
  }
  const failedPayouts = new Set(report.payoutFailures.map((f) => f.taskId));
  for (const { accountId } of report.notificationFailures) {
    for (const t of tasks) {
      if (t.accountId !== accountId || excluded.has(t.taskId) || failedPayouts.has(t.taskId)) continue;
      if (ledger.entriesForTask(t.taskId).length === 0) {
        violations["BR-7"].push(`${label}: ${t.taskId} payout reversed after ${accountId}'s notification failed`);
      }
    }
  }
}

export async function runScenario(scenario, impl = "fixed") {
  const settle = IMPLEMENTATIONS[impl];
  if (!settle) throw new Error(`Unknown implementation: ${impl}`);

  const ledger = new InMemoryLedger();
  const notifier = new FakeNotifier();
  const notificationLog = new Map();
  for (const id of scenario.failPayoutFor ?? []) ledger.failOnceFor(id);
  if (scenario.failNotifications) notifier.failNext(Number(scenario.failNotifications));

  const runs = [];
  const violations = Object.fromEntries(Object.keys(RULES).map((id) => [id, []]));
  for (const [i, planned] of plannedRuns(scenario).entries()) {
    const report = await settle({
      tasks: planned.tasks,
      runAt: new Date(planned.runAt),
      ledger,
      notifier,
      notificationLog,
    });
    runs.push({ runAt: planned.runAt, ...report });
    checkRunRules(`Run ${i + 1}`, planned, report, ledger, notificationLog, violations);
  }

  const accountIds = [...new Set(plannedRuns(scenario).flatMap((r) => r.tasks.map((t) => t.accountId)))];
  const taskIds = [...new Set(ledger.entries.map((e) => e.taskId))];
  const entriesPerTask = Object.fromEntries(taskIds.map((id) => [id, ledger.entriesForTask(id).length]));

  for (const id of taskIds) {
    if (entriesPerTask[id] > 1) violations["BR-5"].push(`${id} paid ${entriesPerTask[id]} times`);
  }
  const sends = new Map();
  for (const m of notifier.sent) {
    const key = `${m.accountId} for the week of ${m.windowStart.slice(0, 10)}`;
    sends.set(key, (sends.get(key) ?? 0) + 1);
  }
  for (const [key, count] of sends) {
    if (count > 1) violations["BR-7"].push(`${key} notified ${count} times`);
  }
  const rules = Object.entries(RULES).map(([id, title]) => {
    const details = [...new Set(violations[id])];
    return { id, title, broken: details.length > 0, details };
  });

  return {
    impl,
    runs,
    rules,
    brokenRules: rules.filter((r) => r.broken).map((r) => r.id),
    final: {
      balances: Object.fromEntries(accountIds.map((a) => [a, ledger.balance(a)])),
      notifications: Object.fromEntries(accountIds.map((a) => [a, notifier.sentTo(a).length])),
      notificationsSent: notifier.sent.map((m) => ({ ...m })),
      entriesPerTask,
      paidMoreThanOnce: taskIds.filter((id) => entriesPerTask[id] > 1),
    },
  };
}
