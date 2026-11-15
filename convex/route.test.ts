/// <reference types="vite/client" />
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { DEMO_GOALS, DEMO_STOPS } from "./routeSample";

const modules = import.meta.glob("./**/*.ts");
const setup = () => convexTest(schema, modules);
type TestCtx = ReturnType<typeof setup>;
const today = "2026-11-15";
beforeEach(() => { vi.useFakeTimers(); vi.stubEnv("OPENAI_API_KEY", "test-placeholder"); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function fixture(t: TestCtx, simple = false) {
  return await t.run(async (ctx) => {
    const stop = (key: string, goalKeys: string[], dependsOn: string[] = []) => ({
      key, goalKeys, title: key, why: key, identity: key, milestone: key, effortHours: 3, minWeeks: 1,
      dependsOn, kind: "build" as const, origin: "goal" as const,
    });
    const goals = simple ? [
      { key: "a", title: "A", summary: "A", weeklyHours: 3, after: [] },
      { key: "b", title: "B", summary: "B", weeklyHours: 3, after: [] },
    ] : DEMO_GOALS;
    const stops = simple ? [stop("a1", ["a"]), stop("b1", ["b"]), stop("shared", ["a", "b"], ["a1", "b1"]), stop("b2", ["b"], ["b1"])] : DEMO_STOPS;
    const old = await ctx.db.insert("goals", { deviceId: "a", text: "old", title: "old", status: "active", questions: [], currentRung: 0, slipDays: 0, missStreak: 0 });
    await ctx.db.insert("tasks", { deviceId: "a", goalId: old, rungIndex: 0, title: "open", why: "why", minutes: 10, forDate: "2026-11-16", status: "open", shrunk: false });
    await ctx.db.insert("tasks", { deviceId: "a", goalId: old, rungIndex: 0, title: "done", why: "why", minutes: 10, forDate: "2026-11-14", status: "done", shrunk: false });
    const routeId = await ctx.db.insert("routes", { deviceId: "a", input: "list", dedication: "steady", startDate: today, status: "ready", goals, stops, synergies: [], merges: [] });
    return { routeId, old };
  });
}
async function activate(t: TestCtx, simple = false) {
  const ids = await fixture(t, simple);
  await t.mutation(api.route.activate, { routeId: ids.routeId, today });
  const route = (await t.query(api.route.get, { routeId: ids.routeId, today }))!.route;
  return { ...ids, goals: route.goals };
}

test("activation preserves wins and creates one actionable copy per shared stop", async () => {
  const t = setup(); const { old, routeId, goals } = await activate(t);
  expect((await t.query(api.goals.get, { goalId: old }))!.status).toBe("paused");
  const result = await t.run(async (ctx) => ({
    tasks: await ctx.db.query("tasks").withIndex("by_goal_and_status", (q) => q.eq("goalId", old)).take(10),
    goals: await ctx.db.query("goals").withIndex("by_device", (q) => q.eq("deviceId", "a")).take(20),
    rungs: await Promise.all(goals.map((g) => ctx.db.query("rungs").withIndex("by_goal_and_index", (q) => q.eq("goalId", g.goalId!)).take(12))),
  }));
  expect(result.tasks.map((x) => x.status)).toEqual(["done"]);
  expect(result.goals.filter((g) => g.status === "active")).toHaveLength(2);
  const keys = result.rungs.flat().map((r) => r.routeStopKey);
  expect(new Set(keys).size).toBe(keys.length);
  await t.mutation(api.route.activate, { routeId, today });
  expect((await t.query(api.goals.list, { deviceId: "a" }))).toHaveLength(6);
});

test("cross-goal prerequisites gate both climb and task eligibility", async () => {
  const t = setup(); const { goals } = await activate(t, true);
  const a = goals[0].goalId!, b = goals[1].goalId!;
  await t.mutation(api.goals.climb, { goalId: a, today });
  expect((await t.query(api.goals.get, { goalId: a }))!.status).toBe("paused");
  expect(await t.mutation(api.goals.climb, { goalId: a, today })).toBeNull();
  const before = await t.query(internal.goals.liveForAi, { deviceId: "a" });
  expect(before.map((g) => g._id)).not.toContain(a);
  await t.mutation(api.goals.climb, { goalId: b, today });
  const after = await t.query(internal.goals.liveForAi, { deviceId: "a" });
  expect(after.map((g) => g._id)).toContain(a);
  expect((await t.query(api.goals.get, { goalId: a }))!.rungs[1].completedAt).toBeUndefined();
});

test("a beneficiary cannot finish or record a win before shared work completes", async () => {
  const t = setup(); const { goals } = await activate(t, true);
  const a = goals[0].goalId!, b = goals[1].goalId!;
  await t.mutation(api.goals.climb, { goalId: b, today });
  await t.mutation(api.goals.climb, { goalId: b, today });
  expect((await t.query(api.goals.get, { goalId: b }))!.status).not.toBe("done");
  expect((await t.query(api.goals.wins, { deviceId: "a" })).milestones.filter((x) => x.kind === "goalDone")).toHaveLength(0);
  await t.mutation(api.goals.climb, { goalId: a, today });
  await t.mutation(api.goals.climb, { goalId: a, today });
  expect((await t.query(api.goals.get, { goalId: a }))!.status).toBe("done");
  expect((await t.query(api.goals.get, { goalId: b }))!.status).toBe("done");
  expect((await t.query(api.goals.wins, { deviceId: "a" })).milestones.filter((x) => x.kind === "goalDone")).toHaveLength(2);
});

test("activation and reroute preserve unresolved historical tasks for re-entry learning", async () => {
  const t = setup(); const { routeId, old } = await fixture(t);
  await t.run(async (ctx) => {
    for (const forDate of ["2026-11-12", "2026-11-13"]) await ctx.db.insert("tasks", { deviceId: "a", goalId: old, rungIndex: 0, title: "miss", why: "why", minutes: 30, forDate, status: "open", shrunk: false });
  });
  await t.mutation(api.route.activate, { routeId, today });
  await t.mutation(api.route.advance, { routeId, today });
  const context = await t.query(api.routeAdherence.context, { deviceId: "a", today: "2026-11-14", forDate: today });
  expect(context.minutesCap).toBe(10);
  const tasks = await t.run((ctx) => ctx.db.query("tasks").withIndex("by_goal_and_status", (q) => q.eq("goalId", old).eq("status", "open")).take(10));
  expect(tasks.map((x) => x.forDate)).toEqual(["2026-11-12", "2026-11-13"]);
});

test("obsolete drafts cannot replace the current route or its budget", async () => {
  const t = setup(); const older = await fixture(t); await vi.advanceTimersByTimeAsync(1);
  const newer = await fixture(t);
  await t.mutation(api.route.activate, { routeId: newer.routeId, today });
  await expect(t.mutation(api.route.activate, { routeId: older.routeId, today })).rejects.toThrow(/newest route draft/);
});

test("input validation and failed-draft retries run through Convex validators", async () => {
  const t = setup();
  await expect(t.mutation(api.route.create, { deviceId: "a", input: " ", dedication: "steady", today })).rejects.toThrow(/goal list/);
  await expect(t.mutation(api.route.create, { deviceId: "a", input: "Learn", dedication: "steady", today: "2026-02-30" })).rejects.toThrow(/valid calendar date/);
  await expect(t.mutation(api.route.create, { deviceId: "a", input: "Learn", dedication: "steady", today, timelineWeeks: -1 })).rejects.toThrow(/timeline/);
  const { routeId } = await fixture(t);
  await t.run((ctx) => ctx.db.patch("routes", routeId, { status: "failed" }));
  await t.mutation(api.route.retry, { routeId });
  await t.mutation(api.route.retry, { routeId });
  expect((await t.query(api.route.get, { routeId, today }))!.route.status).toBe("building");
});

test("per-goal horizons remain separate from capacity and never compress the schedule", async () => {
  const t = setup(); const { routeId } = await fixture(t);
  const before = (await t.query(api.route.get, { routeId, today }))!.plan;
  await t.mutation(api.route.setGoalHorizon, { routeId, goalKey: "run", horizon: { kind: "byDate", date: "2026-11-16", detail: "Event date" } });
  await t.mutation(api.route.setGoalHorizon, { routeId, goalKey: "art", horizon: { kind: "recurring" } });
  await t.mutation(api.route.setGoalHorizon, { routeId, goalKey: "ux", horizon: { kind: "exploration" } });
  const after = (await t.query(api.route.get, { routeId, today }))!;
  expect(after.plan).toEqual(before);
  expect(after.route.goals.find((g) => g.key === "run")!.horizon!.date).toBe("2026-11-16");
  await expect(t.mutation(api.route.setGoalHorizon, { routeId, goalKey: "run", horizon: { kind: "byDate", date: "2026-02-30" } })).rejects.toThrow(/valid calendar date/);
});

async function taskFixture(t: TestCtx, deviceId: string, forDate: string, status: "open" | "done" | "missed", minutes = 30) {
  return await t.run(async (ctx) => {
    const g = await ctx.db.insert("goals", { deviceId, title: "Learn", text: "Learn", status: "active", questions: [], currentRung: 0, slipDays: 0, missStreak: 0 });
    await ctx.db.insert("rungs", { goalId: g, index: 0, title: "Practice", milestone: "Practice", identity: "Learner", kind: "build", weeks: 2 });
    return await ctx.db.insert("tasks", { deviceId, goalId: g, rungIndex: 0, title: "Practice", why: "Learn", minutes, forDate, status, shrunk: false });
  });
}
test("adherence queries hide scores, isolate devices, and persist one fixed episode", async () => {
  const t = setup(); await taskFixture(t, "a", "2026-11-12", "missed"); await taskFixture(t, "a", "2026-11-13", "open"); await taskFixture(t, "b", "2026-11-14", "done");
  const args = { deviceId: "a", today, forDate: "2026-11-16" };
  const visible = await t.query(api.routeAdherence.context, args);
  expect(visible).not.toHaveProperty("model"); expect(visible.explanation).not.toMatch(/%|percent|score/i);
  expect(await t.run((ctx) => ctx.db.query("ramps").take(10))).toHaveLength(0);
  await t.mutation(internal.routeAdherence.prepare, args); const repeat = await t.mutation(internal.routeAdherence.prepare, args);
  expect(repeat.newRamp).toBeNull();
  expect(await t.run((ctx) => ctx.db.query("ramps").take(10))).toHaveLength(1);
  expect((await t.query(internal.routeAdherence.forAi, { ...args, deviceId: "b" })).model.resolved).toBe(1);
  await expect(t.mutation(internal.routeAdherence.prepare, { ...args, today: "invalid" })).rejects.toThrow(/calendar date/);
});

test("historical requests cannot persist new episodes", async () => {
  const t = setup(); await taskFixture(t, "a", "2026-11-12", "missed"); await taskFixture(t, "a", "2026-11-13", "missed");
  await t.mutation(internal.routeAdherence.prepare, { deviceId: "a", today, forDate: "2026-11-14" });
  expect(await t.run((ctx) => ctx.db.query("ramps").take(10))).toHaveLength(0);
});

function response(result: unknown) { return Response.json({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(result) }] }] }); }
test("local-day generation and rewrites obey restart and original task ceilings", async () => {
  const t = setup();
  const task = await taskFixture(t, "a", "2026-11-16", "open", 8);
  await taskFixture(t, "a", "2026-11-12", "missed"); await taskFixture(t, "a", "2026-11-13", "missed");
  vi.stubGlobal("fetch", vi.fn(async () => response({ title: "Small practice", why: "Keep going", minutes: 90, minutesCap: 20, slipDays: 2, note: "Try smaller.", rewrites: [{ title: "Practice", minutes: 90 }], tasks: [{ goal: 0, title: "Practice", why: "Learn", minutes: 90 }] })));
  await t.action(api.ai.swap, { taskId: task, today });
  expect((await t.run((ctx) => ctx.db.get("tasks", task)))!.minutes).toBe(8);
  await t.action(api.ai.shrink, { taskId: task, minutes: 20, today });
  expect((await t.run((ctx) => ctx.db.get("tasks", task)))!.minutes).toBe(8);
  const current = (await t.run((ctx) => ctx.db.get("tasks", task)))!;
  await t.action(internal.ai.shrinkWeek, { goalId: current.goalId, today });
  expect((await t.run((ctx) => ctx.db.get("tasks", task)))!.minutes).toBe(8);
  expect((await t.query(api.goals.get, { goalId: current.goalId }))!.minutesCap).toBe(20);
  await t.action(internal.ai.generateThree, { deviceId: "a", forDate: "2026-11-16", today });
  const tasks = await t.run((ctx) => ctx.db.query("tasks").withIndex("by_device_and_forDate", (q) => q.eq("deviceId", "a").eq("forDate", "2026-11-16")).take(10));
  expect(tasks.every((x) => x.minutes <= 10)).toBe(true);
});

test("daily allocation accounts for completed minutes and can yield one or no new steps", async () => {
  for (const spent of [0, 17, 25]) {
    const t = setup(); const { routeId } = await fixture(t);
    await t.mutation(api.route.setDedication, { routeId, dedication: "casual" });
    await t.mutation(api.route.activate, { routeId, today });
    const goal = (await t.query(internal.goals.liveForAi, { deviceId: "a" }))[0];
    if (spent) await t.run((ctx) => ctx.db.insert("tasks", {
      deviceId: "a", goalId: goal._id, rungIndex: 0, title: "Already done", why: "Progress",
      minutes: spent, forDate: "2026-11-16", status: "done", shrunk: false,
    }));
    vi.stubGlobal("fetch", vi.fn(async () => response({ tasks: Array.from({ length: 3 }, () => ({
      goal: 0, title: "Practice", why: "Small step", minutes: 90,
    })) })));
    await t.action(internal.ai.generateThree, { deviceId: "a", forDate: "2026-11-16", today });
    const tasks = await t.run((ctx) => ctx.db.query("tasks").withIndex("by_device_and_forDate", (q) => q.eq("deviceId", "a").eq("forDate", "2026-11-16")).take(10));
    const open = tasks.filter((task) => task.status === "open");
    expect(open.reduce((sum, task) => sum + task.minutes, spent)).toBeLessThanOrEqual(25);
    expect(open).toHaveLength(spent === 0 ? 3 : spent === 17 ? 1 : 0);
  }
});

test("a still-current local day is not counted as missed after UTC midnight", async () => {
  const t = setup(); vi.setSystemTime(new Date("2026-11-16T02:00:00Z"));
  await taskFixture(t, "a", "2026-11-14", "missed");
  const task = await taskFixture(t, "a", "2026-11-15", "open", 30);
  vi.stubGlobal("fetch", vi.fn(async () => response({ title: "Practice", why: "Learn", minutes: 30 })));
  await t.action(api.ai.swap, { taskId: task, today: "2026-11-15" });
  expect((await t.run((ctx) => ctx.db.get("tasks", task)))!.minutes).toBe(30);
  expect(await t.run((ctx) => ctx.db.query("ramps").take(10))).toHaveLength(0);
});
