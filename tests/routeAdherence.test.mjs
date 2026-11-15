import assert from "node:assert/strict";
import { test } from "node:test";
import { getFunctionName } from "convex/server";
import { buildAdherenceContext, context, forAi, prepare } from "../convex/routeAdherence.ts";
import { generateThree, shrink, shrinkWeek, swap } from "../convex/ai.ts";

const task = (forDate, status = "missed", minutes = 30, deviceId = "a") => ({ forDate, status, minutes, deviceId });
const missed = [task("2026-11-12"), task("2026-11-13", "open")];
const build = (tasks = missed, ramp = null, today = "2026-11-15", forDate = today) => buildAdherenceContext(tasks, ramp, today, forDate);

function database(tasks = missed, ramps = []) {
  const rows = { tasks: [...tasks], ramps: [...ramps] };
  return {
    rows,
    db: {
      query(table) {
        let predicates = [];
        let direction = 1;
        const chain = {
          withIndex(_index, select) {
            const range = Object.fromEntries(["eq", "gte", "lt"].map((op) => [op, (field, value) => {
              predicates.push((row) => op === "eq" ? row[field] === value : op === "gte" ? row[field] >= value : row[field] < value);
              return range;
            }]));
            select(range);
            return chain;
          },
          order(value) { direction = value === "desc" ? -1 : 1; return chain; },
          async take(n) {
            const field = table === "tasks" ? "forDate" : "endDate";
            return rows[table].filter((row) => predicates.every((p) => p(row)))
              .sort((a, b) => direction * a[field].localeCompare(b[field])).slice(0, n);
          },
          async first() { return (await chain.take(1))[0] ?? null; },
        };
        return chain;
      },
      async insert(table, value) { rows[table].push(value); return `id-${rows[table].length}`; },
    },
  };
}

test("past open tasks count as missed; today and future tasks do not affect the model", () => {
  const result = build([...missed, task("2026-11-15", "done"), task("2026-11-16", "missed")]);
  assert.equal(result.model.resolved, 2);
  assert.equal(result.model.missedDaysInRow, 2);
  assert.equal(result.summary.minutesCap, 10);
  assert.equal(result.model.state, "drifting");
});

test("idle calendar days include unscheduled gaps, including when nothing was ever done", () => {
  for (const status of ["done", "missed"]) {
    const result = build([task("2026-11-01", status)]);
    assert.equal(result.model.idleDays, 13);
    assert.equal(result.model.state, "lapsed");
    assert.ok(result.newRamp);
  }
  assert.equal(build([]).newRamp, null);
  assert.equal(build([task("2026-11-14")]).newRamp, null);
});

test("missed days are counted once across goals and a completed day breaks the streak", () => {
  assert.equal(build([task("2026-11-14"), task("2026-11-14")]).model.missedDaysInRow, 1);
  const result = build([...missed, task("2026-11-14", "done")]);
  assert.equal(result.model.missedDaysInRow, 0);
  assert.equal(result.newRamp, null);
});

test("a persisted restart has fixed 10, 15, 20 ceilings and does not roll forward", () => {
  const ramp = build().newRamp;
  const easyHistory = [task("2026-11-14", "done")];
  for (const [date, day, ceiling] of [["2026-11-15", 1, 10], ["2026-11-16", 2, 15], ["2026-11-17", 3, 20]]) {
    const result = build(easyHistory, ramp, date, date);
    assert.equal(result.newRamp, null);
    assert.equal(result.summary.rampDay, day);
    assert.equal(result.summary.minutesCap, ceiling);
    assert.equal(result.summary.ramp.startDate, "2026-11-15");
  }
  assert.equal(build(easyHistory, ramp, "2026-11-18").summary.rampDay, null);
});

test("tomorrow generation starts day one on the target date, including month/year boundaries", () => {
  const result = build(missed, null, "2026-12-31", "2027-01-01");
  assert.equal(result.newRamp.startDate, "2027-01-01");
  assert.equal(result.newRamp.endDate, "2027-01-03");
  assert.equal(result.summary.minutesCap, 10);
});

test("old missed outcomes and idle time cannot restart an expired episode", () => {
  const ramp = build().newRamp;
  assert.equal(build(missed, ramp, "2026-11-25").newRamp, null);
  assert.equal(build([...missed, task("2026-11-17")], ramp, "2026-11-25").newRamp, null);
  const result = build([...missed, task("2026-11-18")], ramp, "2026-11-19");
  assert.equal(result.newRamp.startDate, "2026-11-19");
  assert.equal(result.newRamp.endDate, "2026-11-21");
});

test("weekday sizing and short-session evidence can lower but never raise restart ceilings", () => {
  const tasks = ["2026-11-02", "2026-11-09"].flatMap((date) => [task(date), task(date)]);
  tasks.push(...["2026-11-03", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"].map((date) => task(date, "done")));
  const result = build(tasks, null, "2026-11-15", "2026-11-16");
  assert.ok(result.model.weakDays.includes(1));
  assert.equal(result.summary.minutesCap, 15);
  assert.match(result.summary.explanation, /Mondays/);
  const shortWins = build([
    ...["2026-11-10", "2026-11-11", "2026-11-12"].map((date) => task(date, "done", 10)),
    ...["2026-11-13", "2026-11-14"].map((date) => task(date)),
  ]);
  assert.equal(shortWins.model.shortBeatsLong, true);
  assert.equal(shortWins.summary.minutesCap, 10);
});

test("queries are read-only and hide scores; prepare is idempotent and device-scoped", async () => {
  const store = database([...missed, task("2026-11-14", "done", 30, "b")]);
  const input = { deviceId: "a", today: "2026-11-15", forDate: "2026-11-16" };
  const visible = await context._handler(store, input);
  assert.equal(store.rows.ramps.length, 0);
  assert.equal("model" in visible, false);
  assert.doesNotMatch(visible.explanation, /%|percent|score/i);
  await prepare._handler(store, input);
  const repeated = await prepare._handler(store, input);
  assert.equal(store.rows.ramps.length, 1);
  assert.equal(repeated.newRamp, null);
  assert.equal(repeated.summary.minutesCap, 10);
  assert.deepEqual(store.rows.tasks, [...missed, task("2026-11-14", "done", 30, "b")]);
  const other = await forAi._handler(store, { ...input, deviceId: "b" });
  assert.equal(other.model.resolved, 1);
  assert.equal(other.summary.ramp, null);
});

test("invalid date keys fail before creating ramp state", async () => {
  assert.throws(() => build([], null, "2026-02-30"));
  const store = database();
  await assert.rejects(prepare._handler(store, { deviceId: "a", today: "invalid", forDate: "2026-11-16" }));
  assert.equal(store.rows.ramps.length, 0);
});

test("historical requests cannot persist a new episode", async () => {
  const store = database();
  await prepare._handler(store, { deviceId: "a", today: "2026-11-15", forDate: "2026-11-14" });
  assert.equal(store.rows.ramps.length, 0);
});

test("AI generation receives sentence guidance and clamps model output below route and goal ceilings", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-placeholder";
  let saved;
  let prompt;
  const goals = [
    { _id: "goal-a", title: "Learn", currentRung: 0, rungs: [], recentDone: [], minutesCap: 30 },
    { _id: "goal-b", title: "Read", currentRung: 0, rungs: [], recentDone: [], minutesCap: 5 },
  ];
  globalThis.fetch = async (_url, options) => {
    prompt = JSON.parse(options.body).input[1].content;
    return Response.json({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
      tasks: [{ goal: 0, title: "Practice", why: "Build skill", minutes: 90 }, { goal: 1, title: "Read", why: "Build habit", minutes: 30 }],
    }) }] }] });
  };
  try {
    await generateThree._handler({
      async runQuery(reference) {
        if (getFunctionName(reference) === "route:taskBudget") return null;
        assert.equal(getFunctionName(reference), "goals:liveForAi");
        return goals;
      },
      async runMutation(reference, args) {
        const name = getFunctionName(reference);
        if (name === "routeAdherence:prepare") {
          assert.equal(args.deviceId, "a");
          assert.equal(args.forDate, "2026-11-16");
          assert.match(args.today, /^\d{4}-\d{2}-\d{2}$/);
          return { summary: { minutesCap: 10, explanation: "Ease back in." } };
        }
        if (name === "tasks:replaceForDate") saved = args;
        if (name === "tasks:setPlanner") assert.equal(args.error, undefined);
        return null;
      },
    }, { deviceId: "a", forDate: "2026-11-16" });
    assert.match(prompt, /Route guidance: Ease back in/);
    assert.deepEqual(saved.tasks.map((t) => t.minutes), [10, 5]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});

test("swap, shrink, and the existing missed-week shrink cannot bypass the route ceiling", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-placeholder";
  globalThis.fetch = async () => Response.json({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
    title: "Practice", why: "Build skill", minutes: 90, minutesCap: 20, slipDays: 2, note: "Try a smaller step.", rewrites: [{ title: "Practice", minutes: 90 }],
  }) }] }] });
  const task = { _id: "task-a", deviceId: "a", forDate: "2026-11-16", status: "open", minutesCap: 30, minutes: 30, title: "Learn" };
  const goal = { _id: "goal-a", deviceId: "a", rungs: [], currentRung: 0, minutesCap: 30, title: "Learn" };
  try {
    for (const [fn, args] of [[swap, { taskId: "task-a" }], [shrink, { taskId: "task-a", minutes: 20 }], [shrinkWeek, { goalId: "goal-a" }]]) {
      let saved;
      await fn._handler({
        async runQuery(reference) {
          const name = getFunctionName(reference);
          if (name === "tasks:forAi") return task;
          if (name === "goals:forAi") return goal;
          if (name === "tasks:openForGoal") return [task];
          throw new Error(`Unexpected query ${name}`);
        },
        async runMutation(reference, args) {
          if (getFunctionName(reference) === "routeAdherence:prepare") return { summary: { minutesCap: 10 } };
          saved = args;
          return null;
        },
      }, args);
      if (fn === shrinkWeek) {
        assert.equal(saved.minutesCap, 20);
        assert.equal(saved.rewrites[0].minutes, 10);
        assert.equal(saved.slipDays, 2);
      } else assert.equal(saved.minutes, 10);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});


test("the daily route allowance limits total generated minutes, including a one-step restart", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-placeholder";
  globalThis.fetch = async () => Response.json({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
    tasks: Array.from({ length: 3 }, () => ({ goal: 0, title: "Practice", why: "Build skill", minutes: 90 })),
  }) }] }] });
  try {
    for (const budget of [21, 8, 0]) {
      let saved;
      await generateThree._handler({
        async runQuery(ref) {
          if (getFunctionName(ref) === "route:taskBudget") return budget;
          return [{ _id: "goal-a", title: "Learn", currentRung: 0, rungs: [], recentDone: [] }];
        },
        async runMutation(ref, args) {
          if (getFunctionName(ref) === "routeAdherence:prepare") return { summary: { minutesCap: 30, explanation: "At your pace." } };
          if (getFunctionName(ref) === "tasks:replaceForDate") saved = args;
        },
      }, { deviceId: "a", forDate: "2026-11-16" });
      if (budget === 0) assert.equal(saved, undefined);
      else {
        assert.ok(saved.tasks.reduce((sum, t) => sum + t.minutes, 0) <= budget);
        assert.equal(saved.tasks.length, budget === 8 ? 1 : 3);
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
  }
});
