const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function checkScenario(result, expect = {}) {
  const checks = [];
  const add = (name, expected, actual) => checks.push({ name, expected, actual, pass: same(expected, actual) });

  if (expect.window) add("window", expect.window, result.runs[0] && result.runs[0].window);
  for (const [account, credits] of Object.entries(expect.balances ?? {})) {
    add(`balance ${account}`, credits, result.final.balances[account] ?? 0);
  }
  for (const [account, count] of Object.entries(expect.notifications ?? {})) {
    add(`notifications ${account}`, count, result.final.notifications[account] ?? 0);
  }
  for (const [taskId, count] of Object.entries(expect.entriesPerTask ?? {})) {
    add(`ledger entries ${taskId}`, count, result.final.entriesPerTask[taskId] ?? 0);
  }
  (expect.paidByRun ?? []).forEach((ids, i) => add(`run ${i + 1} paid`, ids, result.runs[i] ? result.runs[i].paid : null));
  (expect.excludedByRun ?? []).forEach((ids, i) =>
    add(`run ${i + 1} excluded`, ids, result.runs[i] ? result.runs[i].excluded : null));

  return { pass: checks.length > 0 && checks.every((c) => c.pass), checks };
}
