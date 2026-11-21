# Rewards settlement QA: duplicate payout regression

A fictional weekly rewards settlement service with a **test bench UI**, a **unit suite** (node:test) and a **Playwright E2E suite**. Together they reproduce and block **DEF-001: a task paid twice when the job is retried or receives a task ID twice** ([defect report](docs/defect-report.md)). The duplicate and retry cases fail on the faulty build and pass on the fixed one; the other cases pass on both and act as controls. Built for a Quest assessment. No live systems are involved.

Start with [directive.md](directive.md) for the objective, scope, completion criteria and all links.

## Setup

Requires Node 20 or later. Works on Windows, macOS and Linux.

```bash
npm install                          # only needed for Playwright
npx playwright install chromium      # once, downloads the browser
```

The unit suite, the UI and the CLI need no install at all.

## 1. Test bench UI (manual testing)

```bash
npm start            # then open http://localhost:4173
```

- **Build under test**: switch between **Fixed** and **Buggy** (top right). The URL keeps the choice: `/?impl=buggy`.
- **Scenario** tab: pick one of the 13 cases (TC-01..TC-13) or **Custom**, edit the run time, tasks (with a live UTC conversion), runs and failure options, then select **Run scenario**. The result shows the rule check (OK, or which of BR-1 to BR-7 are broken and why), whether it matches the case's expected outcome, final balances, ledger entries per task, and every run's details.
- **Run all cases** tab: runs all 13 cases on the selected build and shows the broken rules for each. Fixed: 13 of 13 match. Buggy: TC-07..TC-10 and TC-13 fail (BR-5), the other 8 match.

## 2. Playwright E2E suite (drives the UI)

```bash
npm run e2e            # fixed build: 15 pass
npm run e2e:buggy      # faulty build: TC-07..TC-10 and TC-13 fail (DEF-001); 10 pass
npm run e2e:evidence   # runs both, checks the failing set, writes results/e2e-summary.md
npm run e2e -- --headed          # watch it in a browser
npm run e2e:buggy -- -g TC-08    # one case
npx playwright show-report results/e2e-report-buggy   # HTML report with failure screenshots and traces
```

## 3. Unit suite (no dependencies)

```bash
npm test             # fixed build: 13 pass
npm run test:buggy   # faulty build: 5 fail (TC-07..TC-10, TC-13), 8 pass
npm run evidence     # runs both, writes results/summary.md
```

## 4. Terminal runner

```bash
node scripts/manual.js manual/retry.json --impl buggy   # prints each run and the broken rules
```

## How fixed and buggy are managed

The two builds live side by side: `src/settlement.fixed.js` and `src/settlement.buggy.js`. They share the window and notification code (`src/window.js`, `src/notifications.js`) and differ only in the payout write, marked `DEFECT (DEF-001)`: the buggy build uses a plain insert with no idempotency key and no in-batch dedupe. Every entry point uses the same switch:

| Entry point | Fixed | Buggy |
|---|---|---|
| UI | `/?impl=fixed` or the toggle | `/?impl=buggy` or the toggle |
| Playwright | `npm run e2e` | `npm run e2e:buggy` |
| Unit | `npm test` | `npm run test:buggy` |
| CLI | `--impl fixed` (default) | `--impl buggy` |

Under the hood the npm scripts set `SETTLEMENT_IMPL=fixed|buggy`, in a way that works on Windows too.

## Layout

```
src/            settlement logic: window, ledger, notifier, fixed and buggy builds, scenario runner
ui/             test bench page (index.html, app.js, styles.css)
manual/         13 scenario files (one per case) + index.json
e2e/            Playwright: settlement.spec.ts, page object, fixtures
test/           node:test unit suite
scripts/        local server, runners, evidence scripts
docs/           flow, test cases, defect report, release readiness
results/        evidence from the last runs
```
