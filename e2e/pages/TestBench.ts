import { expect, type Locator, type Page } from "@playwright/test";

export type Impl = "fixed" | "buggy";

export class TestBench {
  readonly page: Page;
  readonly implBadge: Locator;
  readonly scenarioSelect: Locator;
  readonly scenarioDescription: Locator;
  readonly runAt: Locator;
  readonly runAtHint: Locator;
  readonly runs: Locator;
  readonly failPayoutFor: Locator;
  readonly failNotifications: Locator;
  readonly taskRows: Locator;
  readonly addTask: Locator;
  readonly runScenarioButton: Locator;
  readonly ruleCheck: Locator;
  readonly expectCheck: Locator;
  readonly inputError: Locator;
  readonly entriesEmpty: Locator;

  constructor(page: Page) {
    this.page = page;
    this.implBadge = page.getByTestId("impl-badge");
    this.scenarioSelect = page.getByTestId("scenario-select");
    this.scenarioDescription = page.getByTestId("scenario-description");
    this.runAt = page.getByTestId("run-at");
    this.runAtHint = page.getByTestId("run-at-hint");
    this.runs = page.getByTestId("runs");
    this.failPayoutFor = page.getByTestId("fail-payout-for");
    this.failNotifications = page.getByTestId("fail-notifications");
    this.taskRows = page.getByTestId("tasks").getByTestId("task-row");
    this.addTask = page.getByTestId("add-task");
    this.runScenarioButton = page.getByTestId("run-scenario");
    this.ruleCheck = page.getByTestId("rule-check-text");
    this.expectCheck = page.getByTestId("expect-check");
    this.inputError = page.getByTestId("input-error");
    this.entriesEmpty = page.getByTestId("entries-empty");
  }

  async open(impl: Impl): Promise<void> {
    await this.page.goto(`/?impl=${impl}`);
    await expect(this.page.locator("body")).toHaveAttribute("data-ready", "true");
    await expect(this.implBadge).toHaveText(
      impl === "buggy" ? "BUGGY build (settlement.buggy.js)" : "FIXED build (settlement.fixed.js)",
    );
  }

  async runScenario(id: string): Promise<void> {
    await this.selectScenario(id);
    await this.run();
  }

  async selectScenario(id: string): Promise<void> {
    await this.scenarioSelect.selectOption(id);
    await expect(this.scenarioSelect).toHaveValue(id);
  }

  async run(): Promise<void> {
    await this.runScenarioButton.click();
    await expect(this.ruleCheck.or(this.inputError)).toBeVisible();
  }

  task(index: number): { taskId: Locator; account: Locator; status: Locator; completedAt: Locator; utc: Locator } {
    const row = this.taskRows.nth(index);
    return {
      taskId: row.getByLabel("Task ID"),
      account: row.getByLabel("Account"),
      status: row.getByLabel("Status"),
      completedAt: row.getByLabel("Completed at"),
      utc: row.getByTestId("task-utc"),
    };
  }

  balance(account: string): Locator {
    return this.page.getByTestId(`balance-${account}`);
  }

  notifications(account: string): Locator {
    return this.page.getByTestId(`notifications-${account}`);
  }

  entries(taskId: string): Locator {
    return this.page.getByTestId(`entries-${taskId}`);
  }

  runField(n: number, field: string): Locator {
    return this.page.getByTestId(`run-${n}-${field}`);
  }
}
