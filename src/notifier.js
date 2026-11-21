export class NotificationError extends Error {}

export class FakeNotifier {
  constructor() {
    this.sent = [];
    this.failuresRemaining = 0;
  }

  failNext(n = 1) {
    this.failuresRemaining = n;
  }

  async send(message) {
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new NotificationError("Simulated notification provider outage");
    }
    this.sent.push({ ...message });
  }

  sentTo(accountId) {
    return this.sent.filter((m) => m.accountId === accountId);
  }
}
