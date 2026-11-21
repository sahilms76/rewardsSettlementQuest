import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const EXPECTED_BUGGY_FAILURES = ["TC-01", "TC-02", "TC-03", "TC-04", "TC-05", "TC-06", "TC-07", "TC-08", "TC-09", "TC-10", "TC-11", "TC-12", "TC-13"];

mkdirSync("results", { recursive: true });
const files = readdirSync("test").filter((f) => f.endsWith(".test.js")).map((f) => join("test", f));

function run(impl) {
  const junit = join("results", `${impl}-run.junit.xml`);
  const r = spawnSync(
    process.execPath,
    ["--test", "--test-reporter=spec", "--test-reporter-destination=stdout",
      "--test-reporter=junit", `--test-reporter-destination=${junit}`, ...files],
    { encoding: "utf8", env: { ...process.env, SETTLEMENT_IMPL: impl, NO_COLOR: "1", FORCE_COLOR: "0" } },
  );
  const header =
    `Implementation: ${impl}\nNode: ${process.version}\nRun at: ${new Date().toISOString()}\n` +
    `Exit code: ${r.status}\n${"-".repeat(60)}\n`;
  writeFileSync(join("results", `${impl}-run.txt`), header + r.stdout + (r.stderr || ""));

  const xml = readFileSync(junit, "utf8");
  const outcomes = {};
  for (const m of xml.matchAll(/<testcase name="(TC-\d+)[^"]*"[^>]*?(\/>|>([\s\S]*?)<\/testcase>)/g)) {
    outcomes[m[1]] = m[3] && m[3].includes("<failure") ? "FAIL" : "PASS";
  }
  return { status: r.status, outcomes };
}

const buggy = run("buggy");
const fixed = run("fixed");

const ids = Object.keys(fixed.outcomes).sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
const buggyFailures = ids.filter((id) => buggy.outcomes[id] === "FAIL");
const fixedFailures = ids.filter((id) => fixed.outcomes[id] === "FAIL");
const ok =
  JSON.stringify(buggyFailures) === JSON.stringify(EXPECTED_BUGGY_FAILURES) && fixedFailures.length === 0;

const rows = ids.map((id) => `| ${id} | ${buggy.outcomes[id]} | ${fixed.outcomes[id]} |`).join("\n");
writeFileSync(
  join("results", "summary.md"),
  `# Test run summary\n\nGenerated ${new Date().toISOString()} on Node ${process.version}.\n\n` +
    `| Case | Faulty build (settlement.buggy.js) | Fixed build (settlement.fixed.js) |\n|---|---|---|\n${rows}\n\n` +
    `- Faulty build failures: ${buggyFailures.join(", ") || "none"} (expected ${EXPECTED_BUGGY_FAILURES.join(", ")})\n` +
    `- Fixed build failures: ${fixedFailures.join(", ") || "none"}\n` +
    `- Verdict: ${ok ? "PASS: the regression detects DEF-001..DEF-008 and the fix resolves them" : "UNEXPECTED: inspect the run logs"}\n`,
);

console.log(readFileSync(join("results", "summary.md"), "utf8"));
process.exit(ok ? 0 : 1);
