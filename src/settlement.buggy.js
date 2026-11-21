// "DEFECT (DEF-00n)" where it lives. The corrected reference is settlement.fixed.js.

import { LedgerWriteError } from "./ledger.js";
import { emptyReport } from "./notifications.js";

export const CREDITS_PER_TASK = 10;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
// DEFECT (DEF-005): the run is treated as due from Tuesday 00:00 (should be Tuesday 09:00)
const RUN_OFFSET_MS = DAY_MS;

export function settlementWindow(runAt) {
  if (!(runAt instanceof Date) || Number.isNaN(runAt.getTime())) {
    throw new TypeError("runAt must be a valid Date");
  }
  const dayIndexFromMonday = (runAt.getUTCDay() + 6) % 7;
  const mondayMs =
    Date.UTC(runAt.getUTCFullYear(), runAt.getUTCMonth(), runAt.getUTCDate()) - dayIndexFromMonday * DAY_MS;

  let endMondayMs = mondayMs;
  if (runAt.getTime() < endMondayMs + RUN_OFFSET_MS) endMondayMs -= WEEK_MS;

  // DEFECT (DEF-004): end stored as Sunday 23:59:59 and compared inclusively
  return { start: new Date(endMondayMs - WEEK_MS), end: new Date(endMondayMs - 1000), endIncluded: true };
}

export function inWindow(isoTimestamp, window) {
  // DEFECT (DEF-006): the offset is replaced with "Z", so 04:59+05:00 is read as 04:59 UTC
  const t = Date.parse(String(isoTimestamp).replace(/(Z|[+-]\d{2}:?\d{2})$/i, "Z"));
  if (Number.isNaN(t)) throw new TypeError(`Invalid timestamp: ${isoTimestamp}`);
  return t >= window.start.getTime() && t <= window.end.getTime();
}

async function notifyAccounts({ accountIds, windowStart, notifier, notificationLog, report, creditsFor }) {
  for (const accountId of new Set(accountIds)) {
    const credits = creditsFor(accountId);
    if (credits <= 0) continue;

    const key = `notify:${accountId}:${windowStart}`;
    if (notificationLog.get(key) === "delivered") continue;

    try {
      await notifier.send({ accountId, windowStart, credits });
      notificationLog.set(key, "delivered");
      report.notificationsSent.push({ accountId, credits });
      // DEFECT (DEF-008): returns after the first notification instead of moving on to the next account
      return;
    } catch (err) {
      notificationLog.set(key, "failed");
      report.notificationFailures.push({ accountId, error: err.message });
    }
  }
}

export async function settle({ tasks, runAt, ledger, notifier, notificationLog, creditsPerTask = CREDITS_PER_TASK }) {
  const window = settlementWindow(runAt);
  const windowStart = window.start.toISOString();
  const report = emptyReport(window);
  report.window.endIncluded = true;
  const accounts = [];
  const writtenThisRun = [];

  for (const task of tasks) {
    // DEFECT (DEF-007): only "cancelled" is excluded; "in_progress" (or any other status) is paid
    if (task.status === "cancelled" || !inWindow(task.completedAt, window)) {
      report.excluded.push(task.taskId);
      continue;
    }
    // DEFECT (DEF-001): no check for a task ID already seen in this batch
    accounts.push(task.accountId);

    try {
      // DEFECT (DEF-001): plain insert, no idempotency key, so retries and duplicates pay again
      const { entry } = ledger.append({
        accountId: task.accountId,
        taskId: task.taskId,
        amount: creditsPerTask,
        windowStart,
      });
      writtenThisRun.push(entry);
      report.paid.push(task.taskId);
    } catch (err) {
      if (!(err instanceof LedgerWriteError)) throw err;
      report.payoutFailures.push({ taskId: task.taskId, error: err.message });
    }
  }

  // DEFECT (DEF-003): the amount comes from the task list, not the ledger, so a failed
  // payout still produces a "you earned N credits" message
  const claimed = (accountId) => accounts.filter((a) => a === accountId).length * creditsPerTask;
  await notifyAccounts({ accountIds: accounts, windowStart, notifier, notificationLog, report, creditsFor: claimed });

  // DEFECT (DEF-002): treats a notification failure as a failed settlement and rolls the
  // account's payouts back, instead of keeping them and retrying the notification later
  const failedAccounts = new Set(report.notificationFailures.map((f) => f.accountId));
  for (const entry of writtenThisRun) {
    if (!failedAccounts.has(entry.accountId)) continue;
    ledger.reverse(entry);
    report.paid = report.paid.filter((id) => id !== entry.taskId);
  }
  return report;
}
