export class LedgerWriteError extends Error {}

export class InMemoryLedger {
  constructor() {
    this.entries = [];
    this.byKey = new Map();
    this.failNextFor = new Set();
  }

  failOnceFor(taskId) {
    this.failNextFor.add(taskId);
  }

  #maybeFail(taskId) {
    if (this.failNextFor.has(taskId)) {
      this.failNextFor.delete(taskId);
      throw new LedgerWriteError(`Simulated ledger write failure for ${taskId}`);
    }
  }

  append(entry) {
    this.#maybeFail(entry.taskId);
    const row = { key: null, ...entry };
    this.entries.push(row);
    return { created: true, entry: row };
  }

  postOnce(key, entry) {
    const existing = this.byKey.get(key);
    if (existing) return { created: false, entry: existing };
    this.#maybeFail(entry.taskId);
    const row = { key, ...entry };
    this.entries.push(row);
    this.byKey.set(key, row);
    return { created: true, entry: row };
  }

  reverse(entry) {
    this.entries = this.entries.filter((e) => e !== entry);
    if (entry.key) this.byKey.delete(entry.key);
  }

  balance(accountId) {
    return this.entries
      .filter((e) => e.accountId === accountId)
      .reduce((sum, e) => sum + e.amount, 0);
  }

  creditsFor(accountId, windowStart) {
    return this.entries
      .filter((e) => e.accountId === accountId && e.windowStart === windowStart)
      .reduce((sum, e) => sum + e.amount, 0);
  }

  entriesForTask(taskId) {
    return this.entries.filter((e) => e.taskId === taskId);
  }
}
