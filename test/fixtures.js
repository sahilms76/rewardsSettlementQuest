import { settle, InMemoryLedger, FakeNotifier } from "../src/index.js";

export const RUN_AT = new Date("2026-11-10T09:00:00Z");
export const NEXT_RUN_AT = new Date("2026-11-17T09:00:00Z");
export const WINDOW_START = "2026-11-02T00:00:00.000Z";
export const WINDOW_END = "2026-11-09T00:00:00.000Z";
export const NEXT_WINDOW_START = "2026-11-09T00:00:00.000Z";

export function task(taskId, accountId, completedAt, status = "completed") {
  return { taskId, accountId, status, completedAt };
}

export function newEnv() {
  const ledger = new InMemoryLedger();
  const notifier = new FakeNotifier();
  const notificationLog = new Map();
  const run = (tasks, runAt = RUN_AT) => settle({ tasks, runAt, ledger, notifier, notificationLog });
  return { ledger, notifier, notificationLog, run };
}
