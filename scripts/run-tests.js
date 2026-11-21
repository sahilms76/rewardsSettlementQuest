import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const impl = process.argv[2] === "buggy" ? "buggy" : "fixed";
const extra = process.argv.slice(3);
const files = readdirSync("test")
  .filter((f) => f.endsWith(".test.js"))
  .map((f) => join("test", f));

const result = spawnSync(process.execPath, ["--test", ...extra, ...files], {
  stdio: "inherit",
  env: { ...process.env, SETTLEMENT_IMPL: impl },
});
process.exit(result.status ?? 1);
