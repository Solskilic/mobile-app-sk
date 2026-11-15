import { v } from "convex/values";
import { docValidator } from "convex/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type QueryCtx, type MutationCtx } from "./_generated/server";
import schema from "./schema";
import { schedule, adherence, HOURS_PER_WEEK, addDays, type Schedule } from "./routeEngine";

const dedication = v.union(v.literal("casual"), v.literal("steady"), v.literal("allIn"));
const graphGoal = schema.tables.routes.validator.fields.goals;
const graphStop = schema.tables.routes.validator.fields.stops;
const synergies = schema.tables.routes.validator.fields.synergies;
const merges = schema.tables.routes.validator.fields.merges;
const routeDoc = docValidator("routes", schema.tables.routes);
const season = v.union(v.literal("done"), v.literal("now"), v.literal("next"), v.literal("later"));
const scheduleValidator = v.object({
  capacity: v.number(), totalWeeks: v.number(), savedHours: v.number(),
  droppedEdges: v.array(v.object({ from: v.string(), to: v.string() })),
  goals: v.array(v.object({
    key: v.string(), startWeek: v.number(), endWeek: v.number(), season,
    load: v.number(), hostStops: v.array(v.string()),
  })),
  stops: v.array(v.object({
    key: v.string(), host: v.union(v.null(), v.string()), startWeek: v.number(), endWeek: v.number(), season,
  })),
});
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && addDays(s, 0) === s;
const validDate = (s: string) => { if (!isDate(s)) throw new Error("Use a valid calendar date"); };
const DAY = 86_400_000;

async function routeProgress(ctx: QueryCtx, route: Doc<"routes">) {
  const complete = new Set<string>();
  for (const g of route.goals) {
    if (!g.goalId) continue;
    const rungs = await ctx.db.query("rungs")
      .withIndex("by_goal_and_index", (q) => q.eq("goalId", g.goalId!)).take(12);
    for (const rung of rungs) if (rung.completedAt && rung.routeStopKey) complete.add(rung.routeStopKey);
  }
  return complete;
}

export async function routeSchedule(ctx: QueryCtx, route: Doc<"routes">, today: string): Promise<Schedule> {
  const complete = await routeProgress(ctx, route);
  const tasks = await ctx.db.query("tasks")
    .withIndex("by_device_and_forDate", (q) => q.eq("deviceId", route.deviceId).lt("forDate", today))
    .order("desc").take(180);
  const model = adherence(tasks.map((t) => ({ ...t, status: t.status === "done" ? "done" : "missed" })), today);
  return schedule({
    goals: route.goals,
    stops: route.stops.map((s) => ({ ...s, done: complete.has(s.key) })),
    hoursPerWeek: HOURS_PER_WEEK[route.dedication],
    pace: model.resolved < 5 ? 1 : model.pace,
  });
}

export const current = query({
  args: { deviceId: v.string(), today: v.string() },
  returns: v.union(v.null(), v.object({ route: routeDoc, plan: scheduleValidator })),
  handler: async (ctx, { deviceId, today }) => {
    validDate(today);
    const route = await ctx.db.query("routes").withIndex("by_device", (q) => q.eq("deviceId", deviceId)).order("desc").first();
    return route ? { route, plan: await routeSchedule(ctx, route, today) } : null;
  },
});

export const get = query({
  args: { routeId: v.id("routes"), today: v.string() },
  returns: v.union(v.null(), v.object({ route: routeDoc, plan: scheduleValidator })),
  handler: async (ctx, { routeId, today }) => {
    validDate(today);
    const route = await ctx.db.get("routes", routeId);
    return route ? { route, plan: await routeSchedule(ctx, route, today) } : null;
  },
});

export const taskBudget = internalQuery({
  args: { deviceId: v.string(), today: v.string(), forDate: v.string() },
  returns: v.union(v.null(), v.number()),
  handler: async (ctx, { deviceId, today, forDate }) => {
    validDate(today); validDate(forDate);
    const routes = await ctx.db.query("routes").withIndex("by_device", (q) => q.eq("deviceId", deviceId)).order("desc").take(100);
    const route = routes.find((r) => r.activatedAt);
    if (!route) return null;
    const plan = await routeSchedule(ctx, route, today);
    const tasks = await ctx.db.query("tasks").withIndex("by_device_and_forDate", (q) => q.eq("deviceId", deviceId).eq("forDate", forDate)).take(20);
    const spent = tasks.filter((t) => t.status === "done").reduce((sum, t) => sum + t.minutes, 0);
    return Math.max(0, Math.floor(plan.capacity * 60 / 7) - spent);
  },
});

export const create = mutation({
  args: { deviceId: v.string(), input: v.string(), dedication, timelineWeeks: v.optional(v.number()), today: v.string() },
  returns: v.id("routes"),
  handler: async (ctx, args) => {
    validDate(args.today);
    const input = args.input.trim();
    if (!input || input.length > 6000) throw new Error("Write a goal list of up to 6,000 characters");
    if (args.timelineWeeks !== undefined && (!Number.isInteger(args.timelineWeeks) || args.timelineWeeks < 1 || args.timelineWeeks > 520))
      throw new Error("Choose a timeline between 1 and 520 weeks");
    const recent = await ctx.db.query("routes").withIndex("by_device", (q) => q.eq("deviceId", args.deviceId)).order("desc").first();
    if (recent?.status === "building" && recent._creationTime > Date.now() - 5 * 60_000) return recent._id;
    const routeId = await ctx.db.insert("routes", {
      deviceId: args.deviceId, input, dedication: args.dedication, timelineWeeks: args.timelineWeeks,
      startDate: args.today, status: "building", stage: "Reading your list", goals: [], stops: [], synergies: [], merges: [],
    });
    await ctx.scheduler.runAfter(0, internal.routeAi.build, { routeId });
    return routeId;
  },
});

export const retry = mutation({
  args: { routeId: v.id("routes") }, returns: v.null(),
  handler: async (ctx, { routeId }) => {
    const route = await ctx.db.get("routes", routeId);
    if (!route || route.status !== "failed") return null;
    await ctx.db.patch("routes", routeId, { status: "building", error: undefined, stage: "Reading your list" });
    await ctx.scheduler.runAfter(0, internal.routeAi.build, { routeId });
    return null;
  },
});

export const setDedication = mutation({
  args: { routeId: v.id("routes"), dedication }, returns: v.null(),
  handler: async (ctx, { routeId, dedication }) => {
    const route = await ctx.db.get("routes", routeId);
    if (!route || route.status !== "ready") return null;
    await ctx.db.patch("routes", routeId, { dedication });
    return null;
  },
});

export const forAi = internalQuery({
  args: { routeId: v.id("routes") }, returns: v.union(v.null(), routeDoc),
  handler: async (ctx, { routeId }) => await ctx.db.get("routes", routeId),
});

export const setStage = internalMutation({
  args: { routeId: v.id("routes"), stage: v.string() }, returns: v.null(),
  handler: async (ctx, { routeId, stage }) => {
    if ((await ctx.db.get("routes", routeId))?.status === "building") await ctx.db.patch("routes", routeId, { stage });
    return null;
  },
});

export const setFailed = internalMutation({
  args: { routeId: v.id("routes"), error: v.string() }, returns: v.null(),
  handler: async (ctx, { routeId, error }) => {
    if ((await ctx.db.get("routes", routeId))?.status === "building") await ctx.db.patch("routes", routeId, { status: "failed", error });
    return null;
  },
});

export const saveGraph = internalMutation({
  args: { routeId: v.id("routes"), goals: graphGoal, stops: graphStop, synergies, merges },
  returns: v.null(),
  handler: async (ctx, { routeId, goals, stops, synergies, merges }) => {
    const route = await ctx.db.get("routes", routeId);
    if (!route || route.status !== "building") return null;
    if (!goals.length || goals.length > 6 || !stops.length || stops.length > 48) throw new Error("Route graph exceeded its bounds");
    if (new Set(goals.map((g) => g.key)).size !== goals.length || new Set(stops.map((s) => s.key)).size !== stops.length)
      throw new Error("Route graph contained duplicate keys");
    await ctx.db.patch("routes", routeId, { goals, stops, synergies, merges, status: "ready", stage: undefined });
    return null;
  },
});

async function removeOpen(ctx: MutationCtx, goalId: Id<"goals">) {
  const tasks = await ctx.db.query("tasks").withIndex("by_goal_and_status", (q) => q.eq("goalId", goalId).eq("status", "open")).take(100);
  for (const task of tasks) await ctx.db.delete("tasks", task._id);
}

export const activate = mutation({
  args: { routeId: v.id("routes"), today: v.string() }, returns: v.null(),
  handler: async (ctx, { routeId, today }) => {
    validDate(today);
    const route = await ctx.db.get("routes", routeId);
    if (!route || route.status !== "ready" || route.activatedAt) return null;
    const plan = await routeSchedule(ctx, route, today);
    const existing = await ctx.db.query("goals").withIndex("by_device", (q) => q.eq("deviceId", route.deviceId)).take(100);
    for (const g of existing) {
      if (g.status !== "done" && g.status !== "paused") {
        await ctx.db.patch("goals", g._id, { status: "paused" });
        await removeOpen(ctx, g._id);
      }
    }
    const goals = [];
    for (const g of route.goals) {
      const scheduled = plan.goals.find((p) => p.key === g.key)!;
      const mine = plan.stops.filter((p) => p.host === g.key);
      const now = scheduled.season === "now";
      const goalId = await ctx.db.insert("goals", {
        deviceId: route.deviceId, text: g.summary, title: g.title, status: now ? "active" : "paused",
        questions: [], currentRung: 0, slipDays: 0, missStreak: 0, routeId,
        startedAt: Date.parse(today + "T12:00:00Z"),
        projectedFinish: Date.parse(today + "T12:00:00Z") + scheduled.endWeek * 7 * DAY,
        estimateWeeks: scheduled.endWeek,
        estimateLabel: "Working estimate from your hours and provisional effort assumptions",
      });
      for (const [index, p] of mine.entries()) {
        const s = route.stops.find((x) => x.key === p.key)!;
        await ctx.db.insert("rungs", {
          goalId, index, title: s.title, identity: s.identity, milestone: s.milestone,
          weeks: Math.max(1, p.endWeek - p.startWeek), kind: s.kind, routeStopKey: s.key,
        });
      }
      goals.push({ ...g, goalId });
    }
    await ctx.db.patch("routes", routeId, { goals, activatedAt: Date.now(), startDate: today });
    await ctx.scheduler.runAfter(0, internal.ai.generateThree, { deviceId: route.deviceId, forDate: addDays(today, 1) });
    return null;
  },
});

export const advance = mutation({
  args: { routeId: v.id("routes"), today: v.string() }, returns: v.null(),
  handler: async (ctx, { routeId, today }) => {
    validDate(today);
    const route = await ctx.db.get("routes", routeId);
    if (!route?.activatedAt) return null;
    const routes = await ctx.db.query("routes").withIndex("by_device", (q) => q.eq("deviceId", route.deviceId)).order("desc").take(100);
    if (routes.find((r) => r.activatedAt)?._id !== routeId) throw new Error("A newer route is in use. Open your current route instead.");
    const plan = await routeSchedule(ctx, route, today);
    for (const g of route.goals) {
      if (!g.goalId) continue;
      const goal = await ctx.db.get("goals", g.goalId);
      if (!goal || goal.status === "done") continue;
      await removeOpen(ctx, goal._id);
      const p = plan.goals.find((s) => s.key === g.key)!;
      const desired = p.season === "now" ? "active" : p.season === "done" ? "done" : "paused";
      if (goal.status !== desired) {
        await ctx.db.patch("goals", goal._id, { status: desired });
        if (desired !== "active") await removeOpen(ctx, goal._id);
      }
      const base = Date.parse(today + "T12:00:00Z");
      await ctx.db.patch("goals", goal._id, { projectedFinish: base + p.endWeek * 7 * DAY });
    }
    await ctx.scheduler.runAfter(0, internal.ai.generateThree, { deviceId: route.deviceId, forDate: addDays(today, 1) });
    return null;
  },
});
