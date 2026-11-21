import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const EXPECTED_BUGGY_FAILURES = ["TC-01", "TC-02", "TC-03", "TC-04", "TC-05", "TC-06", "TC-07", "TC-08", "TC-09", "TC-10", "TC-11", "TC-12", "TC-13", "UI-01"];
const cli = join("node_modules", "@playwright", "test", "cli.js");
mkdirSync("results", { recursive: true });

function run(impl) {
  const r = spawnSync(process.execPath, [cli, "test"], {
    encoding: "utf8",
    env: { ...process.env, SETTLEMENT_IMPL: impl, FORCE_COLOR: "0", NO_COLOR: "1" },
  });
  writeFileSync(
    join("results", `e2e-${impl}-run.txt`),
    `Implementation: ${impl}\nRun at: ${new Date().toISOString()}\nExit code: ${r.status}\n${"-".repeat(60)}\n${r.stdout}${r.stderr ?? ""}`,
  );

  const report = JSON.parse(readFileSync(join("results", `e2e-${impl}.json`), "utf8"));
  const outcomes = {};
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      const id = spec.title.split(":")[0];
      const statuses = spec.tests.flatMap((t) => t.results.map((x) => x.status));
      outcomes[id] = { title: spec.title, status: spec.ok ? "PASS" : statuses.includes("skipped") ? "SKIP" : "FAIL" };
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const s of report.suites) walk(s);
  return { status: r.status, outcomes };
}

const buggy = run("buggy");
const fixed = run("fixed");

const order = (id) => (id.startsWith("TC-") ? 0 : 1000) + Number(id.replace(/\D/g, ""));
const ids = Object.keys(fixed.outcomes).sort((a, b) => order(a) - order(b));
const buggyFailures = ids.filter((id) => buggy.outcomes[id]?.status === "FAIL");
const fixedNotPassing = ids.filter((id) => fixed.outcomes[id].status !== "PASS");
const ok = JSON.stringify(buggyFailures) === JSON.stringify(EXPECTED_BUGGY_FAILURES) && fixedNotPassing.length === 0;

const rows = ids
  .map((id) => `| ${id} | ${fixed.outcomes[id].title.slice(id.length + 2)} | ${buggy.outcomes[id]?.status ?? "-"} | ${fixed.outcomes[id].status} |`)
  .join("\n");
writeFileSync(
  join("results", "e2e-summary.md"),
  `# Playwright E2E summary\n\nGenerated ${new Date().toISOString()}. Chromium, driven through the test bench UI.\n\n` +
    `| Case | Outcome asserted | Faulty build | Fixed build |\n|---|---|---|---|\n${rows}\n\n` +
    `- Faulty build failures: ${buggyFailures.join(", ") || "none"} (expected ${EXPECTED_BUGGY_FAILURES.join(", ")})\n` +
    `- Fixed build not passing: ${fixedNotPassing.join(", ") || "none"}\n` +
    `- Verdict: ${ok ? "PASS: the E2E regression detects DEF-001..DEF-008 and the fix resolves them" : "UNEXPECTED: inspect results/e2e-*-run.txt"}\n` +
    `\nHTML reports: \`results/e2e-report-buggy/index.html\`, \`results/e2e-report-fixed/index.html\` (open with \`npx playwright show-report results/e2e-report-buggy\`).\n`,
);

console.log(readFileSync(join("results", "e2e-summary.md"), "utf8"));
process.exit(ok ? 0 : 1);
