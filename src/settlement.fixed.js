import { settlementWindow, inWindow } from "./window.js";
import { LedgerWriteError } from "./ledger.js";
import { notifyAccounts, emptyReport } from "./notifications.js";

export const CREDITS_PER_TASK = 10;

export async function settle({ tasks, runAt, ledger, notifier, notificationLog, creditsPerTask = CREDITS_PER_TASK }) {
  const window = settlementWindow(runAt);
  const windowStart = window.start.toISOString();
  const report = emptyReport(window);
  const seen = new Set();
  const accounts = [];

  for (const task of tasks) {
    if (task.status !== "completed" || !inWindow(task.completedAt, window)) {
      report.excluded.push(task.taskId);
      continue;
    }
    if (seen.has(task.taskId)) {
      report.duplicatesInInput.push(task.taskId);
      continue;
    }
    seen.add(task.taskId);
    accounts.push(task.accountId);

    try {
      const result = ledger.postOnce(`payout:${task.taskId}`, {
        accountId: task.accountId,
        taskId: task.taskId,
        amount: creditsPerTask,
        windowStart,
      });
      (result.created ? report.paid : report.alreadyPaid).push(task.taskId);
    } catch (err) {
      if (!(err instanceof LedgerWriteError)) throw err;
      report.payoutFailures.push({ taskId: task.taskId, error: err.message });
    }
  }

  await notifyAccounts({ accountIds: accounts, windowStart, ledger, notifier, notificationLog, report });
  return report;
}
