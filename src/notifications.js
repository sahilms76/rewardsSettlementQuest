export async function notifyAccounts({ accountIds, windowStart, ledger, notifier, notificationLog, report }) {
  for (const accountId of new Set(accountIds)) {
    const credits = ledger.creditsFor(accountId, windowStart);
    if (credits <= 0) continue;

    const key = `notify:${accountId}:${windowStart}`;
    if (notificationLog.get(key) === "delivered") continue;

    try {
      await notifier.send({ accountId, windowStart, credits });
      notificationLog.set(key, "delivered");
      report.notificationsSent.push({ accountId, credits });
    } catch (err) {
      notificationLog.set(key, "failed");
      report.notificationFailures.push({ accountId, error: err.message });
    }
  }
}

export function emptyReport(window) {
  return {
    window: { start: window.start.toISOString(), end: window.end.toISOString() },
    paid: [],
    alreadyPaid: [],
    duplicatesInInput: [],
    excluded: [],
    payoutFailures: [],
    notificationsSent: [],
    notificationFailures: [],
  };
}
