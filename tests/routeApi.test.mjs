import assert from "node:assert/strict";
import { test } from "node:test";
import { activate, advance, create, retry, setDedication } from "../convex/route.ts";
import { DEMO_GOALS, DEMO_STOPS } from "../convex/routeSample.ts";

function store() {
  let id = 10;
  const rows = {
    routes: [{ _id: "route", _creationTime: 1, deviceId: "a", input: "sample", dedication: "steady", status: "ready", startDate: "2026-11-15", goals: DEMO_GOALS, stops: DEMO_STOPS, synergies: [], merges: [] }],
    goals: [{ _id: "old", _creationTime: 0, deviceId: "a", status: "active" }],
    rungs: [],
    tasks: [{ _id: "old-open", deviceId: "a", goalId: "old", status: "open", forDate: "2026-11-16" }, { _id: "old-done", deviceId: "a", goalId: "old", status: "done", forDate: "2026-11-14", minutes: 10 }],
  };
  const jobs = [];
  const ctx = { scheduler: { async runAfter(...args) { jobs.push(args); } }, db: {
    async get(table, key) { return rows[table].find((r) => r._id === key) ?? null; },
    async patch(table, key, data) { Object.assign(rows[table].find((r) => r._id === key), data); },
    async insert(table, data) { const key = table + ++id; rows[table].push({ ...data, _id: key, _creationTime: id }); return key; },
    async delete(table, key) { rows[table] = rows[table].filter((r) => r._id !== key); },
    query(table) {
      const predicates = []; let direction = 1; let sortField = "_creationTime";
      const chain = {
        withIndex(index, fn) {
          sortField = index.includes("forDate") ? "forDate" : index.includes("and_index") ? "index" : "_creationTime";
          const q = Object.fromEntries(["eq", "lt", "gte"].map((op) => [op, (field, value) => {
            predicates.push((r) => op === "eq" ? r[field] === value : op === "lt" ? r[field] < value : r[field] >= value);
            return q;
          }]));
          fn(q); return chain;
        },
        order(d) { direction = d === "desc" ? -1 : 1; return chain; },
        async take(n) { return rows[table].filter((r) => predicates.every((p) => p(r))).sort((a, b) => direction * (a[sortField] < b[sortField] ? -1 : a[sortField] > b[sortField] ? 1 : 0)).slice(0, n); },
        async first() { return (await chain.take(1))[0] ?? null; },
      };
      return chain;
    },
  } };
  return { rows, ctx, jobs };
}
test("route activation pauses old work, preserves wins, and creates at most two active ladders", async () => {
  const { rows, ctx, jobs } = store();
  await activate._handler(ctx, { routeId: "route", today: "2026-11-15" });
  assert.equal(rows.goals.find((g) => g._id === "old").status, "paused");
  assert.ok(rows.tasks.some((t) => t._id === "old-done"));
  assert.equal(rows.tasks.some((t) => t._id === "old-open"), false);
  assert.equal(rows.goals.filter((g) => g.status === "active").length, 2);
  assert.equal(rows.routes[0].goals.length, 5);
  assert.ok(rows.routes[0].goals.every((g) => g.goalId));
  const keys = rows.rungs.map((r) => r.routeStopKey);
  assert.equal(keys.length, new Set(keys).size, "shared stops appear on one actionable ladder, not two");
  assert.equal(jobs.length, 1);
  const count = rows.goals.length;
  await activate._handler(ctx, { routeId: "route", today: "2026-11-15" });
  assert.equal(rows.goals.length, count, "activation is idempotent");
});
test("completed shared milestones keep credit when the route is recomputed", async () => {
  const { rows, ctx } = store();
  await activate._handler(ctx, { routeId: "route", today: "2026-11-15" });
  for (const r of rows.rungs) if (r.goalId === rows.routes[0].goals.find((g) => g.key === "run").goalId) r.completedAt = 1;
  await advance._handler(ctx, { routeId: "route", today: "2026-11-16" });
  assert.equal(rows.goals.find((g) => g._id === rows.routes[0].goals.find((g) => g.key === "run").goalId).status, "done");
  assert.ok(rows.goals.filter((g) => g.status === "active").length <= 2);
});
test("an old route cannot activate alongside a newer one", async () => {
  const { rows, ctx } = store();
  await activate._handler(ctx, { routeId: "route", today: "2026-11-15" });
  rows.routes.push({ ...rows.routes[0], _id: "newer", _creationTime: 99, activatedAt: Date.now() });
  await assert.rejects(() => advance._handler(ctx, { routeId: "route", today: "2026-11-15" }), /newer route/);
});
test("input bounds and invalid dates fail before any route is created", async () => {
  const { rows, ctx } = store();
  await assert.rejects(() => create._handler(ctx, { deviceId: "a", input: "Learn", dedication: "steady", today: "2026-02-30" }), /valid calendar date/);
  await assert.rejects(() => create._handler(ctx, { deviceId: "a", input: " ", dedication: "steady", today: "2026-11-15" }), /goal list/);
  await assert.rejects(() => create._handler(ctx, { deviceId: "a", input: "Learn", dedication: "steady", today: "2026-11-15", timelineWeeks: -1 }), /timeline/);
  assert.equal(rows.routes.length, 1);
});
test("failed drafts can retry without creating another route", async () => {
  const { rows, ctx, jobs } = store();
  rows.routes[0].status = "failed";
  await retry._handler(ctx, { routeId: "route" });
  assert.equal(rows.routes[0].status, "building");
  assert.equal(jobs.length, 1);
  await retry._handler(ctx, { routeId: "route" });
  assert.equal(jobs.length, 1);
  rows.routes[0].status = "ready";
  await setDedication._handler(ctx, { routeId: "route", dedication: "casual" });
  assert.equal(rows.routes[0].dedication, "casual");
});
