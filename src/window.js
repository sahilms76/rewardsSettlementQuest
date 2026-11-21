const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const RUN_OFFSET_MS = DAY_MS + 9 * 60 * 60 * 1000;

export function settlementWindow(runAt) {
  if (!(runAt instanceof Date) || Number.isNaN(runAt.getTime())) {
    throw new TypeError("runAt must be a valid Date");
  }
  const dayIndexFromMonday = (runAt.getUTCDay() + 6) % 7;
  const mondayMs =
    Date.UTC(runAt.getUTCFullYear(), runAt.getUTCMonth(), runAt.getUTCDate()) -
    dayIndexFromMonday * DAY_MS;

  let endMs = mondayMs;
  if (runAt.getTime() < endMs + RUN_OFFSET_MS) endMs -= WEEK_MS;

  return { start: new Date(endMs - WEEK_MS), end: new Date(endMs) };
}

export function inWindow(isoTimestamp, window) {
  const t = Date.parse(isoTimestamp);
  if (Number.isNaN(t)) throw new TypeError(`Invalid timestamp: ${isoTimestamp}`);
  return t >= window.start.getTime() && t < window.end.getTime();
}
