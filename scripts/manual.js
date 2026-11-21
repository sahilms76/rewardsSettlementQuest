import { readFileSync } from "node:fs";
import { runScenario } from "../src/scenario-runner.js";
import { checkScenario } from "../src/scenario-check.js";

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const flagValues = new Set(["--impl", "--runs"].map((f) => flag(f.slice(2))).filter(Boolean));
const file = args.find((a) => !a.startsWith("--") && !flagValues.has(a));

if (!file) {
  console.log("Usage: node scripts/manual.js <scenario.json> [--impl buggy|fixed] [--runs N]");
  console.log("Example: node scripts/manual.js manual/retry.json --impl buggy");
  process.exit(1);
}

const scenario = JSON.parse(readFileSync(file, "utf8"));
if (flag("runs")) scenario.runs = Number(flag("runs"));
const impl = flag("impl") === "buggy" ? "buggy" : "fixed";
const result = await runScenario(scenario, impl);

const list = (xs) => (xs.length ? xs.join(", ") : "-");
console.log(`Scenario: ${scenario.id ?? ""} ${scenario.title ?? file}`);
if (scenario.description) console.log(`What it shows: ${scenario.description}`);
console.log(`Implementation: ${impl}`);

result.runs.forEach((r, i) => {
  console.log(`\n--- Run ${i + 1} (run time ${r.runAt}) ---`);
  console.log(`Window:                ${r.window.start}  to  ${r.window.end} (end ${r.window.endIncluded ? "included" : "excluded"})`);
  console.log(`Paid now:              ${list(r.paid)}`);
  console.log(`Already paid (skip):   ${list(r.alreadyPaid)}`);
  console.log(`Duplicate rows (skip): ${list(r.duplicatesInInput)}`);
  console.log(`Excluded:              ${list(r.excluded)}`);
  console.log(`Payout failures:       ${list(r.payoutFailures.map((f) => f.taskId))}`);
  console.log(`Notifications sent:    ${list(r.notificationsSent.map((n) => `${n.accountId} (${n.credits} credits)`))}`);
  console.log(`Notification failed:   ${list(r.notificationFailures.map((n) => n.accountId))}`);
});

console.log("\n=== Final state ===");
for (const [account, credits] of Object.entries(result.final.balances)) {
  console.log(`${account}: balance ${credits} credits, notifications received ${result.final.notifications[account]}`);
}
const perTask = Object.entries(result.final.entriesPerTask);
console.log(`Ledger entries per task: ${perTask.map(([id, n]) => `${id}=${n}`).join(", ") || "none"}`);
console.log(result.brokenRules.length
  ? `${result.brokenRules.length === 1 ? "RULE" : "RULES"} BROKEN: ${result.brokenRules.join(", ")}`
  : "Rule check: no business rule broken -> OK");
for (const rule of result.rules) {
  console.log(`  ${rule.id} ${rule.broken ? "BROKEN" : "OK"}: ${rule.title}`);
  for (const d of rule.details) console.log(`    - ${d}`);
}

if (scenario.expect) {
  const check = checkScenario(result, scenario.expect);
  console.log(`Expected outcome: ${check.pass ? "MATCH" : "MISMATCH"}`);
  for (const c of check.checks.filter((x) => !x.pass)) {
    console.log(`  ${c.name}: expected ${JSON.stringify(c.expected)}, got ${JSON.stringify(c.actual)}`);
  }
}
