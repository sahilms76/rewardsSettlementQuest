import { test as base, expect } from "@playwright/test";
import { TestBench, type Impl } from "./pages/TestBench";

export const IMPL: Impl = process.env.SETTLEMENT_IMPL === "buggy" ? "buggy" : "fixed";

export const test = base.extend<{ bench: TestBench }>({
  bench: async ({ page }, use) => {
    const bench = new TestBench(page);
    await bench.open(IMPL);
    await use(bench);
  },
});

export { expect };
