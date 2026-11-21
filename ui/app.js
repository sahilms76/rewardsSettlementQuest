import { runScenario } from "/src/scenario-runner.js";
import { checkScenario } from "/src/scenario-check.js";

const $ = (sel) => document.querySelector(sel);
const STATUSES = ["completed", "in_progress", "cancelled"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const BLANK = {
  id: "Custom", title: "Custom scenario", description: "Build your own case: edit the run time, tasks and failure options.",
  runAt: "2026-11-10T09:00:00Z", runs: 1, tasks: [], expect: null,
};

const state = { impl: "fixed", index: [], scenarios: new Map(), current: null };

const pad = (n) => String(n).padStart(2, "0");
export function utcLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const secs = d.getUTCSeconds() || d.getUTCMilliseconds()
    ? `:${pad(d.getUTCSeconds())}${d.getUTCMilliseconds() ? "." + String(d.getUTCMilliseconds()).padStart(3, "0") : ""}`
    : "";
  return `${DAYS[d.getUTCDay()]} ${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${secs} UTC`;
}
const listText = (xs) => (xs.length ? xs.join(", ") : "none");
const brokenRulesText = (ids) =>
  !ids.length ? "OK: no business rule broken" : `${ids.length === 1 ? "RULE" : "RULES"} BROKEN: ${ids.join(", ")}`;
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
};
const clone = (o) => JSON.parse(JSON.stringify(o));

function setImpl(impl, { updateUrl = true } = {}) {
  state.impl = impl === "buggy" ? "buggy" : "fixed";
  document.querySelector(`input[name="impl"][value="${state.impl}"]`).checked = true;
  const badge = $('[data-testid="impl-badge"]');
  badge.textContent = state.impl === "buggy" ? "BUGGY build (settlement.buggy.js)" : "FIXED build (settlement.fixed.js)";
  badge.className = `badge ${state.impl}`;
  if (updateUrl) {
    const url = new URL(location.href);
    url.searchParams.set("impl", state.impl);
    history.replaceState(null, "", url);
  }
  clearResult();
  clearAll();
}

function selectTab(name) {
  for (const [tab, panel] of [["tab-scenario", "panel-scenario"], ["tab-all", "panel-all"]]) {
    const on = tab === `tab-${name}`;
    $(`#${tab}`).setAttribute("aria-selected", String(on));
    $(`#${panel}`).hidden = !on;
  }
}

function taskRow(task, onRemove) {
  const utc = el("span", { class: "utc", "data-testid": "task-utc" });
  const updateUtc = (value) => {
    const label = utcLabel(value);
    utc.textContent = label ? `= ${label}` : "Not a valid ISO 8601 time";
    utc.classList.toggle("invalid", !label);
  };
  const input = (label, field, value) =>
    el("input", { "aria-label": label, "data-field": field, value: value ?? "", spellcheck: "false" });
  const completedAt = input("Completed at", "completedAt", task.completedAt);
  completedAt.addEventListener("input", () => updateUtc(completedAt.value));
  const status = el("select", { "aria-label": "Status", "data-field": "status" },
    ...STATUSES.map((s) => el("option", { value: s, text: s })));
  status.value = STATUSES.includes(task.status) ? task.status : "completed";
  updateUtc(task.completedAt ?? "");

  const row = el("div", { class: "task", "data-testid": "task-row" },
    input("Task ID", "taskId", task.taskId),
    input("Account", "accountId", task.accountId),
    status,
    completedAt,
    el("button", { class: "icon", "aria-label": "Remove task", title: "Remove task", text: "✕", onclick: () => { row.remove(); onRemove?.(); } }),
    utc,
  );
  return row;
}

function renderTasks(container, tasks) {
  container.replaceChildren(...tasks.map((t) => taskRow(t)));
}

function readTasks(container) {
  return [...container.querySelectorAll('[data-testid="task-row"]')].map((row) => {
    const get = (f) => row.querySelector(`[data-field="${f}"]`).value.trim();
    return { taskId: get("taskId"), accountId: get("accountId"), status: get("status"), completedAt: get("completedAt") };
  });
}

function nextTaskDefaults(existing) {
  const n = existing.length + 1;
  return { taskId: `T-NEW-${n}`, accountId: "acc-A", status: "completed", completedAt: "2026-11-04T10:00:00Z" };
}

function loadScenarioIntoForm(scenario) {
  state.current = clone(scenario);
  $('[data-testid="scenario-description"]').textContent = scenario.description ?? "";
  $("#run-at").value = scenario.runAt ?? "";
  $("#runs").value = scenario.runs ?? 1;
  $("#fail-payout-for").value = (scenario.failPayoutFor ?? []).join(", ");
  $("#fail-notifications").value = scenario.failNotifications ?? 0;
  renderTasks($("#tasks"), scenario.tasks ?? []);
  const hasNext = Boolean(scenario.nextWeek);
  $("#next-week-toggle").checked = hasNext;
  $("#next-week").hidden = !hasNext;
  $("#next-week-run-at").value = scenario.nextWeek?.runAt ?? "2026-11-17T09:00:00Z";
  renderTasks($("#next-week-tasks"), scenario.nextWeek?.tasks ?? []);
  updateRunAtHint();
  clearResult();
}

function readForm() {
  const s = {
    id: state.current?.id ?? "Custom",
    title: state.current?.title,
    runAt: $("#run-at").value.trim(),
    runs: Math.max(1, Number($("#runs").value) || 1),
    failPayoutFor: $("#fail-payout-for").value.split(",").map((x) => x.trim()).filter(Boolean),
    failNotifications: Math.max(0, Number($("#fail-notifications").value) || 0),
    tasks: readTasks($("#tasks")),
    expect: state.current?.expect ?? null,
  };
  if ($("#next-week-toggle").checked) {
    s.nextWeek = { runAt: $("#next-week-run-at").value.trim(), tasks: readTasks($("#next-week-tasks")) };
  }
  return s;
}

function updateRunAtHint() {
  const label = utcLabel($("#run-at").value);
  $('[data-testid="run-at-hint"]').textContent = label ? `= ${label}` : "Not a valid ISO 8601 time";
}

function formEdited(formScenario) {
  if (!state.current) return true;
  const strip = (s) => JSON.stringify({
    runAt: s.runAt, runs: Number(s.runs ?? 1), failPayoutFor: s.failPayoutFor ?? [],
    failNotifications: Number(s.failNotifications ?? 0), tasks: s.tasks ?? [], nextWeek: s.nextWeek ?? null,
  });
  return strip(formScenario) !== strip(state.current);
}

function validate(s) {
  const errors = [];
  if (!utcLabel(s.runAt)) errors.push("Run time is not a valid ISO 8601 time.");
  s.tasks.concat(s.nextWeek?.tasks ?? []).forEach((t, i) => {
    if (!t.taskId) errors.push(`Task ${i + 1}: task ID is empty.`);
    if (!t.accountId) errors.push(`Task ${i + 1}: account is empty.`);
    if (!utcLabel(t.completedAt)) errors.push(`Task ${t.taskId || i + 1}: completed at is not a valid ISO 8601 time.`);
  });
  if (s.nextWeek && !utcLabel(s.nextWeek.runAt)) errors.push("Next week run time is not a valid ISO 8601 time.");
  return errors;
}

function clearResult() {
  const result = $("#result");
  result.replaceChildren(
    el("h2", { text: "Result" }),
    el("p", { class: "muted", "data-testid": "result-empty" }, "Choose a scenario and select ", el("strong", { text: "Run scenario" }), "."),
  );
}

function renderResult(scenario, result) {
  const final = result.final;
  const broken = result.brokenRules;
  const nodes = [
    el("h2", { text: `Result · ${result.impl === "buggy" ? "BUGGY" : "FIXED"} build` }),
    el("div", { class: `banner ${broken.length ? "bad" : "ok"}`, "data-testid": "rule-check" },
      el("span", { "data-testid": "rule-check-text", text: brokenRulesText(broken) }),
      el("ul", { class: "rules", "data-testid": "rules-list" }, ...result.rules.map((r) =>
        el("li", { class: r.broken ? "broken" : "held", "data-testid": `rule-${r.id}`, "data-status": r.broken ? "broken" : "ok" },
          el("strong", { text: `${r.id} ${r.broken ? "BROKEN" : "OK"}` }), ` · ${r.title}`,
          r.broken ? el("ul", { "data-testid": `rule-${r.id}-details` }, ...r.details.map((d) => el("li", { text: d }))) : null)))),
  ];

  if (scenario.expect && !formEdited(scenario)) {
    const check = checkScenario(result, scenario.expect);
    const failed = check.checks.filter((c) => !c.pass);
    nodes.push(el("div", { class: `banner ${check.pass ? "ok" : "bad"}`, "data-testid": "expect-check" },
      check.pass ? `Matches the expected outcome for ${scenario.id}` : `Does not match the expected outcome for ${scenario.id} (${failed.length} difference${failed.length === 1 ? "" : "s"})`,
      failed.length ? el("ul", { class: "mismatch" }, ...failed.map((c) =>
        el("li", { text: `${c.name}: expected ${JSON.stringify(c.expected)}, got ${JSON.stringify(c.actual)}` }))) : null));
  } else {
    nodes.push(el("div", { class: "banner neutral", "data-testid": "expect-check" },
      "Custom or edited input: no expected outcome to compare. Check the values below against the rules."));
  }

  nodes.push(el("h3", { text: "Final state" }));
  nodes.push(el("table", { "data-testid": "accounts-table" },
    el("thead", {}, el("tr", {}, el("th", { text: "Account" }), el("th", { text: "Balance (credits)" }), el("th", { text: "Notifications received" }))),
    el("tbody", {}, ...Object.keys(final.balances).map((a) => el("tr", { "data-testid": "account-row", "data-account": a },
      el("td", { text: a }),
      el("td", { class: "num", "data-testid": `balance-${a}`, text: String(final.balances[a]) }),
      el("td", { class: "num", "data-testid": `notifications-${a}`, text: String(final.notifications[a]) }),
    )))));

  const tasks = Object.entries(final.entriesPerTask);
  nodes.push(el("h3", { text: "Ledger entries per task" }));
  nodes.push(tasks.length
    ? el("table", { "data-testid": "entries-table" },
      el("thead", {}, el("tr", {}, el("th", { text: "Task" }), el("th", { text: "Ledger entries" }))),
      el("tbody", {}, ...tasks.map(([id, n]) => el("tr", {},
        el("td", { text: id }),
        el("td", { class: `num${n > 1 ? " bad" : ""}`, "data-testid": `entries-${id}`, text: String(n) })))))
    : el("p", { class: "muted", "data-testid": "entries-empty", text: "No ledger entries." }));

  nodes.push(el("h3", { text: "Runs" }));
  nodes.push(el("div", { class: "runs" }, ...result.runs.map((r, i) => {
    const n = i + 1;
    const item = (label, key, value) => [el("dt", { text: label }), el("dd", { "data-testid": `run-${n}-${key}`, text: value })];
    return el("div", { class: "run", "data-testid": `run-${n}` },
      el("h4", { text: `Run ${n} · run time ${utcLabel(r.runAt)}` }),
      el("dl", {},
        ...item("Window", "window", `${utcLabel(r.window.start)} to ${utcLabel(r.window.end)} (end ${r.window.endIncluded ? "included" : "excluded"})`),
        ...item("Paid now", "paid", listText(r.paid)),
        ...item("Already paid (skipped)", "already-paid", listText(r.alreadyPaid)),
        ...item("Duplicate rows (skipped)", "duplicates", listText(r.duplicatesInInput)),
        ...item("Excluded", "excluded", listText(r.excluded)),
        ...item("Payout failures", "payout-failures", listText(r.payoutFailures.map((f) => f.taskId))),
        ...item("Notifications sent", "notifications-sent", listText(r.notificationsSent.map((m) => `${m.accountId} (${m.credits} credits)`))),
        ...item("Notification failures", "notification-failures", listText(r.notificationFailures.map((f) => f.accountId))),
      ));
  })));

  $("#result").replaceChildren(...nodes);
}

async function runCurrent() {
  const scenario = readForm();
  const errors = validate(scenario);
  if (errors.length) {
    $("#result").replaceChildren(el("h2", { text: "Result" }),
      el("div", { class: "banner bad", "data-testid": "input-error" }, "Fix the input first:",
        el("ul", { class: "mismatch" }, ...errors.map((e) => el("li", { text: e })))));
    return;
  }
  renderResult(scenario, await runScenario(scenario, state.impl));
}

function clearAll() {
  $("#run-all-summary").textContent = "";
  renderCaseRows(new Map());
}

function renderCaseRows(outcomes) {
  $("#cases-body").replaceChildren(...state.index.map((entry) => {
    const outcome = outcomes.get(entry.id);
    const status = outcome
      ? el("span", { class: `status ${outcome.pass ? "pass" : "fail"}`, "data-testid": `case-status-${entry.id}`, text: outcome.pass ? "PASS" : "FAIL" })
      : el("span", { class: "muted", "data-testid": `case-status-${entry.id}`, text: "not run" });
    const rules = outcome
      ? el("span", { class: outcome.brokenRules.length ? "rules-broken" : "muted", "data-testid": `case-rules-${entry.id}`,
        text: outcome.brokenRules.length ? outcome.brokenRules.join(", ") : "none" })
      : el("span", { class: "muted", "data-testid": `case-rules-${entry.id}`, text: "" });
    const details = outcome && !outcome.pass
      ? el("details", {}, el("summary", { text: "Differences" }),
        el("ul", { class: "mismatch" }, ...outcome.checks.filter((c) => !c.pass).map((c) =>
          el("li", { text: `${c.name}: expected ${JSON.stringify(c.expected)}, got ${JSON.stringify(c.actual)}` }))))
      : null;
    return el("tr", { "data-testid": "case-row", "data-case": entry.id },
      el("td", { text: entry.id }),
      el("td", {}, entry.title, details),
      el("td", {}, status),
      el("td", {}, rules),
      el("td", {}, el("button", { class: "secondary", text: "Open", onclick: () => openCase(entry.id) })));
  }));
}

async function runAll() {
  const outcomes = new Map();
  for (const entry of state.index) {
    const scenario = state.scenarios.get(entry.id);
    const result = await runScenario(scenario, state.impl);
    outcomes.set(entry.id, { ...checkScenario(result, scenario.expect), brokenRules: result.brokenRules });
  }
  const passed = [...outcomes.values()].filter((o) => o.pass).length;
  const failedIds = state.index.filter((e) => !outcomes.get(e.id).pass).map((e) => e.id);
  $("#run-all-summary").textContent =
    `${state.impl.toUpperCase()} build: ${passed} of ${state.index.length} cases match the expected outcome` +
    (failedIds.length ? `. Failing: ${failedIds.join(", ")}` : "");
  renderCaseRows(outcomes);
}

function openCase(id) {
  $("#scenario-select").value = id;
  loadScenarioIntoForm(state.scenarios.get(id));
  selectTab("scenario");
}

async function init() {
  state.index = await (await fetch("/manual/index.json")).json();
  for (const entry of state.index) {
    state.scenarios.set(entry.id, await (await fetch(`/manual/${entry.file}`)).json());
  }
  const select = $("#scenario-select");
  select.replaceChildren(
    ...state.index.map((e) => el("option", { value: e.id, text: `${e.id} · ${e.title}` })),
    el("option", { value: "Custom", text: "Custom · start from a blank scenario" }),
  );

  select.addEventListener("change", () =>
    loadScenarioIntoForm(select.value === "Custom" ? BLANK : state.scenarios.get(select.value)));
  for (const radio of document.querySelectorAll('input[name="impl"]')) {
    radio.addEventListener("change", () => setImpl(radio.value));
  }
  $("#tab-scenario").addEventListener("click", () => selectTab("scenario"));
  $("#tab-all").addEventListener("click", () => selectTab("all"));
  $("#run-at").addEventListener("input", updateRunAtHint);
  $("#add-task").addEventListener("click", () =>
    $("#tasks").append(taskRow(nextTaskDefaults(readTasks($("#tasks"))))));
  $("#add-next-week-task").addEventListener("click", () =>
    $("#next-week-tasks").append(taskRow({ ...nextTaskDefaults(readTasks($("#next-week-tasks"))), completedAt: "2026-11-11T10:00:00Z" })));
  $("#next-week-toggle").addEventListener("change", (e) => { $("#next-week").hidden = !e.target.checked; });
  $("#run-scenario").addEventListener("click", runCurrent);
  $("#reset").addEventListener("click", () =>
    loadScenarioIntoForm(select.value === "Custom" ? BLANK : state.scenarios.get(select.value)));
  $("#run-all").addEventListener("click", runAll);

  setImpl(new URL(location.href).searchParams.get("impl"), { updateUrl: false });
  select.value = state.index[0].id;
  loadScenarioIntoForm(state.scenarios.get(select.value));
  document.body.dataset.ready = "true";
}

init();
