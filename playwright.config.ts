import { defineConfig, devices } from "@playwright/test";

const impl = process.env.SETTLEMENT_IMPL === "buggy" ? "buggy" : "fixed";
const PORT = Number(process.env.PORT ?? 4173);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: `results/e2e-report-${impl}`, open: "never" }],
    ["json", { outputFile: `results/e2e-${impl}.json` }],
  ],
  outputDir: `results/e2e-artifacts-${impl}`,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  metadata: { impl },
  projects: [{ name: `chromium-${impl}`, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } }],
  webServer: {
    command: "node scripts/serve.js",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
