// FAULTY build: reproduces DEF-001 only. Everything else matches settlement.fixed.js.

import { settlementWindow, inWindow } from "./window.js";
import { LedgerWriteError } from "./ledger.js";
import { notifyAccounts, emptyReport } from "./notifications.js";

export { settlementWindow, inWindow };
export const CREDITS_PER_TASK = 10;

export async function settle({ tasks, runAt, ledger, notifier, notificationLog, creditsPerTask = CREDITS_PER_TASK }) {
  const window = settlementWindow(runAt);
  const windowStart = window.start.toISOString();
  const report = emptyReport(window);
  const accounts = [];

  for (const task of tasks) {
    if (task.status !== "completed" || !inWindow(task.completedAt, window)) {
      report.excluded.push(task.taskId);
      continue;
    }
    // DEFECT (DEF-001): no check for a task ID already seen in this batch
    accounts.push(task.accountId);

    try {
      // DEFECT (DEF-001): plain insert, no idempotency key, so retries and duplicates pay again
      ledger.append({ accountId: task.accountId, taskId: task.taskId, amount: creditsPerTask, windowStart });
      report.paid.push(task.taskId);
    } catch (err) {
      if (!(err instanceof LedgerWriteError)) throw err;
      report.payoutFailures.push({ taskId: task.taskId, error: err.message });
    }
  }

  await notifyAccounts({ accountIds: accounts, windowStart, ledger, notifier, notificationLog, report });
  return report;
}
