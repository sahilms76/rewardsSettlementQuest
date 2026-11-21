import * as fixed from "./settlement.fixed.js";
import * as buggy from "./settlement.buggy.js";
import * as window from "./window.js";

export const IMPL = process.env.SETTLEMENT_IMPL === "buggy" ? "buggy" : "fixed";
export const settle = IMPL === "buggy" ? buggy.settle : fixed.settle;
export const settlementWindow = IMPL === "buggy" ? buggy.settlementWindow : window.settlementWindow;
export const inWindow = IMPL === "buggy" ? buggy.inWindow : window.inWindow;
export const CREDITS_PER_TASK = fixed.CREDITS_PER_TASK;

export { InMemoryLedger } from "./ledger.js";
export { FakeNotifier } from "./notifier.js";
