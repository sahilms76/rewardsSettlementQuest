import { spawnSync } from "node:child_process";
import { join } from "node:path";

const impl = process.argv[2] === "buggy" ? "buggy" : "fixed";
const extra = process.argv.slice(3);
const cli = join("node_modules", "@playwright", "test", "cli.js");

const result = spawnSync(process.execPath, [cli, "test", ...extra], {
  stdio: "inherit",
  env: { ...process.env, SETTLEMENT_IMPL: impl },
});
process.exit(result.status ?? 1);
