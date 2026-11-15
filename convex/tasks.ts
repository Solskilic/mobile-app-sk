import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { DAY } from "./goals";

const MISSES_BEFORE_SHRINK = 2;

async function decorate(ctx: QueryCtx, tasks: Doc<"tasks">[]) {
  return await Promise.all(
    tasks.map(async (task) => {
      const goal = await ctx.db.get("goals", task.goalId);
      const rung = await ctx.db
        .query("rungs")
        .withIndex("by_goal_and_index", (q) => q.eq("goalId", task.goalId).eq("index", task.rungIndex))
        .unique();
      return { ...task, goalTitle: goal?.title ?? "", rungTitle: rung?.title ?? "" };
    }),
  );
}

export const upcoming = query({
  args: { deviceId: v.string(), today: v.string() },
  handler: async (ctx, { deviceId, today }) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_device_and_forDate", (q) => q.eq("deviceId", deviceId).gte("forDate", today))
      .take(30);
    const forDate = (tasks.find((t) => t.status === "open") ?? tasks[tasks.length - 1])?.forDate;
    return {
      forDate: forDate ?? null,
      tasks: await decorate(ctx, tasks.filter((t) => t.forDate === forDate)),
    };
  },
});

export const past = query({
  args: { deviceId: v.string(), today: v.string() },
  handler: async (ctx, { deviceId, today }) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_device_and_forDate", (q) => q.eq("deviceId", deviceId).lt("forDate", today))
      .order("desc")
      .take(21);
    return await decorate(ctx, tasks);
  },
});

async function shiftFinish(ctx: MutationCtx, goal: Doc<"goals">, days: number) {
  await ctx.db.patch("goals", goal._id, {
    slipDays: Math.max(0, goal.slipDays + days),
    projectedFinish: goal.projectedFinish === undefined ? undefined : goal.projectedFinish + days * DAY,
  });
}

async function markMissed(ctx: MutationCtx, task: Doc<"tasks">) {
  if (task.status !== "open") return;
  await ctx.db.patch("tasks", task._id, { status: "missed" });
  const goal = await ctx.db.get("goals", task.goalId);
  if (!goal) return;
  await shiftFinish(ctx, goal, 1);
  await ctx.db.insert("checkins", {
    deviceId: task.deviceId,
    goalId: goal._id,
    taskId: task._id,
    kind: "missed",
    at: Date.now(),
  });
  const missStreak = goal.missStreak + 1;
  if (missStreak >= MISSES_BEFORE_SHRINK && goal.status === "active") {
    await ctx.db.patch("goals", goal._id, { missStreak: 0 });
    await ctx.scheduler.runAfter(0, internal.ai.shrinkWeek, { goalId: goal._id });
  } else {
    await ctx.db.patch("goals", goal._id, { missStreak });
  }
}

export const setDone = mutation({
  args: { taskId: v.id("tasks"), done: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { taskId, done }) => {
    const task = await ctx.db.get("tasks", taskId);
    if (!task) return null;
    const goal = await ctx.db.get("goals", task.goalId);
    if (done && task.status !== "done") {
      if (task.status === "missed" && goal) await shiftFinish(ctx, goal, -1);
      await ctx.db.patch("tasks", taskId, { status: "done", completedAt: Date.now() });
      if (goal) await ctx.db.patch("goals", goal._id, { missStreak: 0 });
      await ctx.db.insert("checkins", {
        deviceId: task.deviceId,
        goalId: task.goalId,
        taskId,
        kind: "done",
        at: Date.now(),
      });
    } else if (!done && task.status === "done") {
      await ctx.db.patch("tasks", taskId, { status: "open", completedAt: undefined });
      const checkin = await ctx.db
        .query("checkins")
        .withIndex("by_goal", (q) => q.eq("goalId", task.goalId))
        .order("desc")
        .take(100);
      const mine = checkin.find((c) => c.taskId === taskId && c.kind === "done");
      if (mine) await ctx.db.delete("checkins", mine._id);
    }
    return null;
  },
});

export const miss = mutation({
  args: { taskId: v.id("tasks") },
  returns: v.null(),
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get("tasks", taskId);
    if (task) await markMissed(ctx, task);
    return null;
  },
});

export const lifeHappened = mutation({
  args: { deviceId: v.string(), forDate: v.string() },
  returns: v.null(),
  handler: async (ctx, { deviceId, forDate }) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_device_and_forDate", (q) => q.eq("deviceId", deviceId).eq("forDate", forDate))
      .take(10);
    for (const task of tasks) await markMissed(ctx, task);
    return null;
  },
});

export const rollover = mutation({
  args: { deviceId: v.string(), today: v.string() },
  returns: v.null(),
  handler: async (ctx, { deviceId, today }) => {
    const stale = await ctx.db
      .query("tasks")
      .withIndex("by_device_and_forDate", (q) => q.eq("deviceId", deviceId).lt("forDate", today))
      .order("desc")
      .take(30);
    for (const task of stale) await markMissed(ctx, task);
    return null;
  },
});

export const plan = mutation({
  args: { deviceId: v.string(), forDate: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal.ai.generateThree, args);
    return null;
  },
});

export const forAi = internalQuery({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get("tasks", taskId);
    if (!task) return null;
    const [decorated] = await decorate(ctx, [task]);
    const goal = await ctx.db.get("goals", task.goalId);
    return { ...decorated, smart: goal?.smart?.statement ?? "", minutesCap: goal?.minutesCap ?? 30 };
  },
});

export const openForGoal = internalQuery({
  args: { goalId: v.id("goals") },
  handler: async (ctx, { goalId }) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_goal_and_status", (q) => q.eq("goalId", goalId).eq("status", "open"))
      .take(10);
  },
});

const draft = v.object({
  goalId: v.id("goals"),
  rungIndex: v.number(),
  title: v.string(),
  why: v.string(),
  minutes: v.number(),
});

export const replaceForDate = internalMutation({
  args: { deviceId: v.string(), forDate: v.string(), tasks: v.array(draft) },
  returns: v.null(),
  handler: async (ctx, { deviceId, forDate, tasks }) => {
    const existing = await ctx.db
      .query("tasks")
      .withIndex("by_device_and_forDate", (q) => q.eq("deviceId", deviceId).eq("forDate", forDate))
      .take(20);
    for (const t of existing) if (t.status === "open") await ctx.db.delete("tasks", t._id);
    const kept = existing.filter((t) => t.status !== "open").length;
    for (const t of tasks.slice(0, Math.max(0, 3 - kept))) {
      await ctx.db.insert("tasks", { ...t, deviceId, forDate, status: "open", shrunk: false });
    }
    return null;
  },
});

export const rewrite = internalMutation({
  args: {
    taskId: v.id("tasks"),
    title: v.string(),
    why: v.string(),
    minutes: v.number(),
    shrunk: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { taskId, ...fields }) => {
    const task = await ctx.db.get("tasks", taskId);
    if (task && task.status === "open") await ctx.db.patch("tasks", taskId, fields);
    return null;
  },
});

export const applyWeekShrink = internalMutation({
  args: {
    goalId: v.id("goals"),
    note: v.string(),
    minutesCap: v.number(),
    slipDays: v.number(),
    rewrites: v.array(v.object({ taskId: v.id("tasks"), title: v.string(), minutes: v.number() })),
  },
  returns: v.null(),
  handler: async (ctx, { goalId, note, minutesCap, slipDays, rewrites }) => {
    const goal = await ctx.db.get("goals", goalId);
    if (!goal) return null;
    const now = Date.now();
    await ctx.db.patch("goals", goalId, { minutesCap, coachNote: { text: note, at: now } });
    await shiftFinish(ctx, { ...goal }, slipDays);
    for (const r of rewrites) {
      const task = await ctx.db.get("tasks", r.taskId as Id<"tasks">);
      if (task && task.status === "open") {
        await ctx.db.patch("tasks", task._id, { title: r.title, minutes: r.minutes, shrunk: true });
      }
    }
    await ctx.db.insert("checkins", { deviceId: goal.deviceId, goalId, kind: "shrunkWeek", note, at: now });
    return null;
  },
});
