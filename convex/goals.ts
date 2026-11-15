import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { resourceValidator, smartValidator, verdictValidator } from "./schema";

export const MAX_ACTIVE = 3;
export const DAY = 24 * 60 * 60 * 1000;
const LIVE_STATUSES = ["clarifying", "planning", "active", "failed"] as const;

async function liveGoals(ctx: QueryCtx, deviceId: string) {
  const groups = await Promise.all(
    LIVE_STATUSES.map((status) =>
      ctx.db
        .query("goals")
        .withIndex("by_device_and_status", (q) => q.eq("deviceId", deviceId).eq("status", status))
        .take(MAX_ACTIVE + 1),
    ),
  );
  return groups.flat();
}

async function rungsOf(ctx: QueryCtx, goalId: Id<"goals">) {
  return await ctx.db
    .query("rungs")
    .withIndex("by_goal_and_index", (q) => q.eq("goalId", goalId))
    .take(10);
}

async function withRungs(ctx: QueryCtx, goal: Doc<"goals">) {
  return { ...goal, rungs: await rungsOf(ctx, goal._id) };
}

async function clearOpenTasks(ctx: MutationCtx, goalId: Id<"goals">) {
  const open = await ctx.db
    .query("tasks")
    .withIndex("by_goal_and_status", (q) => q.eq("goalId", goalId).eq("status", "open"))
    .take(50);
  for (const task of open) await ctx.db.delete("tasks", task._id);
}

export const add = mutation({
  args: { deviceId: v.string(), text: v.string() },
  returns: v.union(
    v.object({ status: v.literal("ok"), goalId: v.id("goals") }),
    v.object({
      status: v.literal("limit"),
      active: v.array(v.object({ _id: v.id("goals"), title: v.string() })),
    }),
  ),
  handler: async (ctx, { deviceId, text }) => {
    const trimmed = text.trim();
    if (!trimmed) throw new Error("Say your goal in a few words");
    const live = await liveGoals(ctx, deviceId);
    if (live.length >= MAX_ACTIVE) {
      return {
        status: "limit" as const,
        active: live.map((g) => ({ _id: g._id, title: g.title })),
      };
    }
    const goalId = await ctx.db.insert("goals", {
      deviceId,
      text: trimmed,
      title: trimmed,
      status: "clarifying",
      questions: [],
      currentRung: 0,
      slipDays: 0,
      missStreak: 0,
    });
    await ctx.scheduler.runAfter(0, internal.ai.clarify, { goalId });
    return { status: "ok" as const, goalId };
  },
});

export const answer = mutation({
  args: { goalId: v.id("goals"), answers: v.array(v.string()), tomorrow: v.string() },
  returns: v.null(),
  handler: async (ctx, { goalId, answers, tomorrow }) => {
    const goal = await ctx.db.get("goals", goalId);
    if (!goal) throw new Error("Goal not found");
    await ctx.db.patch("goals", goalId, {
      status: "planning",
      error: undefined,
      questions: goal.questions.map((q, i) => ({ ...q, answer: answers[i]?.trim() || "Not sure" })),
    });
    await ctx.scheduler.runAfter(0, internal.ai.plan, { goalId, tomorrow });
    return null;
  },
});

export const retry = mutation({
  args: { goalId: v.id("goals"), tomorrow: v.string() },
  returns: v.null(),
  handler: async (ctx, { goalId, tomorrow }) => {
    const goal = await ctx.db.get("goals", goalId);
    if (!goal || goal.status !== "failed") return null;
    const answered = goal.questions.length > 0 && goal.questions.every((q) => q.answer);
    await ctx.db.patch("goals", goalId, {
      status: answered ? "planning" : "clarifying",
      error: undefined,
    });
    if (answered) await ctx.scheduler.runAfter(0, internal.ai.plan, { goalId, tomorrow });
    else await ctx.scheduler.runAfter(0, internal.ai.clarify, { goalId });
    return null;
  },
});

export const pause = mutation({
  args: { goalId: v.id("goals") },
  returns: v.null(),
  handler: async (ctx, { goalId }) => {
    const goal = await ctx.db.get("goals", goalId);
    if (!goal) return null;
    if (goal.status === "active") {
      await ctx.db.patch("goals", goalId, { status: "paused" });
      await clearOpenTasks(ctx, goalId);
    } else if (goal.status !== "done") {
      await removeGoal(ctx, goalId);
    }
    return null;
  },
});

export const resume = mutation({
  args: { goalId: v.id("goals") },
  returns: v.union(v.literal("ok"), v.literal("limit")),
  handler: async (ctx, { goalId }) => {
    const goal = await ctx.db.get("goals", goalId);
    if (!goal || goal.status !== "paused") return "ok" as const;
    const live = await liveGoals(ctx, goal.deviceId);
    if (live.length >= MAX_ACTIVE) return "limit" as const;
    await ctx.db.patch("goals", goalId, { status: "active" });
    return "ok" as const;
  },
});

async function removeGoal(ctx: MutationCtx, goalId: Id<"goals">) {
  const research = await ctx.db.query("research").withIndex("by_goal", (q) => q.eq("goalId", goalId)).take(20);
  for (const run of research) await ctx.db.delete("research", run._id);
  for (const rung of await rungsOf(ctx, goalId)) await ctx.db.delete("rungs", rung._id);
  for (const status of ["open", "done", "missed"] as const) {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_goal_and_status", (q) => q.eq("goalId", goalId).eq("status", status))
      .take(500);
    for (const task of tasks) await ctx.db.delete("tasks", task._id);
  }
  const checkins = await ctx.db
    .query("checkins")
    .withIndex("by_goal", (q) => q.eq("goalId", goalId))
    .take(500);
  for (const c of checkins) await ctx.db.delete("checkins", c._id);
  await ctx.db.delete("goals", goalId);
}

export const remove = mutation({
  args: { goalId: v.id("goals") },
  returns: v.null(),
  handler: async (ctx, { goalId }) => {
    if (await ctx.db.get("goals", goalId)) await removeGoal(ctx, goalId);
    return null;
  },
});

export const climb = mutation({
  args: { goalId: v.id("goals") },
  returns: v.union(
    v.null(),
    v.object({
      kind: v.union(v.literal("rung"), v.literal("goal")),
      identity: v.string(),
      next: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, { goalId }) => {
    const goal = await ctx.db.get("goals", goalId);
    if (!goal || goal.status !== "active") return null;
    const rungs = await rungsOf(ctx, goalId);
    const rung = rungs[goal.currentRung];
    if (!rung) return null;
    const now = Date.now();
    await ctx.db.patch("rungs", rung._id, { completedAt: now });
    const next = rungs[goal.currentRung + 1];
    if (!next) {
      await ctx.db.patch("goals", goalId, {
        status: "done",
        completedAt: now,
        currentRung: rungs.length,
      });
      await clearOpenTasks(ctx, goalId);
      await ctx.db.insert("checkins", {
        deviceId: goal.deviceId,
        goalId,
        kind: "goalDone",
        note: rung.identity,
        at: now,
      });
      return { kind: "goal" as const, identity: rung.identity, next: null };
    }
    await ctx.db.patch("goals", goalId, { currentRung: goal.currentRung + 1, missStreak: 0 });
    const stale = await ctx.db
      .query("tasks")
      .withIndex("by_goal_and_status", (q) => q.eq("goalId", goalId).eq("status", "open"))
      .take(50);
    for (const task of stale) await ctx.db.delete("tasks", task._id);
    for (const forDate of new Set(stale.map((t) => t.forDate))) {
      await ctx.scheduler.runAfter(0, internal.ai.generateThree, { deviceId: goal.deviceId, forDate });
    }
    await ctx.db.insert("checkins", {
      deviceId: goal.deviceId,
      goalId,
      kind: "rungClimbed",
      note: rung.identity,
      at: now,
    });
    return { kind: "rung" as const, identity: rung.identity, next: next.title };
  },
});

export const list = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const goals = await ctx.db
      .query("goals")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .order("desc")
      .take(30);
    return await Promise.all(goals.map((g) => withRungs(ctx, g)));
  },
});

export const get = query({
  args: { goalId: v.id("goals") },
  handler: async (ctx, { goalId }) => {
    const goal = await ctx.db.get("goals", goalId);
    return goal ? await withRungs(ctx, goal) : null;
  },
});

export const wins = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const checkins = await ctx.db
      .query("checkins")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .order("desc")
      .take(300);
    const titles = new Map<Id<"goals">, string>();
    for (const c of checkins) {
      if (!titles.has(c.goalId)) titles.set(c.goalId, (await ctx.db.get("goals", c.goalId))?.title ?? "");
    }
    return {
      tasksDone: checkins.filter((c) => c.kind === "done").length,
      milestones: checkins
        .filter((c) => c.kind === "rungClimbed" || c.kind === "goalDone")
        .map((c) => ({
          _id: c._id,
          kind: c.kind,
          identity: c.note ?? "",
          goalTitle: titles.get(c.goalId) ?? "",
          at: c.at,
        })),
    };
  },
});

export const forAi = internalQuery({
  args: { goalId: v.id("goals") },
  handler: async (ctx, { goalId }) => {
    const goal = await ctx.db.get("goals", goalId);
    return goal ? await withRungs(ctx, goal) : null;
  },
});

export const liveForAi = internalQuery({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const goals = await ctx.db
      .query("goals")
      .withIndex("by_device_and_status", (q) => q.eq("deviceId", deviceId).eq("status", "active"))
      .take(MAX_ACTIVE);
    return await Promise.all(
      goals.map(async (g) => {
        const recent = await ctx.db
          .query("tasks")
          .withIndex("by_goal_and_status", (q) => q.eq("goalId", g._id).eq("status", "done"))
          .order("desc")
          .take(8);
        return { ...(await withRungs(ctx, g)), recentDone: recent.map((t) => t.title) };
      }),
    );
  },
});

export const saveQuestions = internalMutation({
  args: {
    goalId: v.id("goals"),
    title: v.string(),
    questions: v.array(v.object({ question: v.string(), options: v.array(v.string()) })),
  },
  returns: v.null(),
  handler: async (ctx, { goalId, title, questions }) => {
    const goal = await ctx.db.get("goals", goalId);
    if (!goal || goal.status !== "clarifying") return null;
    await ctx.db.patch("goals", goalId, { title, questions });
    return null;
  },
});

export const savePlan = internalMutation({
  args: {
    goalId: v.id("goals"),
    title: v.string(),
    smart: smartValidator,
    verdict: verdictValidator,
    estimateLabel: v.string(),
    rungs: v.array(
      v.object({
        title: v.string(),
        identity: v.string(),
        milestone: v.string(),
        weeks: v.number(),
        kind: v.union(v.literal("explore"), v.literal("build")),
      }),
    ),
  },
  returns: v.boolean(),
  handler: async (ctx, { goalId, rungs, ...plan }) => {
    const goal = await ctx.db.get("goals", goalId);
    if (!goal || goal.status !== "planning") return false;
    for (const old of await rungsOf(ctx, goalId)) await ctx.db.delete("rungs", old._id);
    for (const [index, rung] of rungs.entries()) {
      await ctx.db.insert("rungs", { goalId, index, ...rung });
    }
    const estimateWeeks = rungs.reduce((sum, r) => sum + r.weeks, 0);
    const now = Date.now();
    await ctx.db.patch("goals", goalId, {
      ...plan,
      status: "active",
      estimateWeeks,
      currentRung: 0,
      startedAt: now,
      projectedFinish: now + estimateWeeks * 7 * DAY,
    });
    return true;
  },
});

export const setFailed = internalMutation({
  args: { goalId: v.id("goals"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, { goalId, error }) => {
    const goal = await ctx.db.get("goals", goalId);
    if (goal && (goal.status === "clarifying" || goal.status === "planning")) {
      await ctx.db.patch("goals", goalId, { status: "failed", error });
    }
    return null;
  },
});

export const research = mutation({
  args: { goalId: v.id("goals") },
  returns: v.null(),
  handler: async (ctx, { goalId }) => {
    const goal = await ctx.db.get("goals", goalId);
    if (!goal || goal.researching) return null;
    await ctx.db.patch("goals", goalId, { researching: true });
    await ctx.scheduler.runAfter(0, internal.ai.research, { goalId });
    return null;
  },
});

export const saveResources = internalMutation({
  args: { goalId: v.id("goals"), resources: v.optional(v.array(resourceValidator)) },
  returns: v.null(),
  handler: async (ctx, { goalId, resources }) => {
    const goal = await ctx.db.get("goals", goalId);
    if (!goal) return null;
    await ctx.db.patch("goals", goalId, {
      researching: false,
      ...(resources ? { resources } : {}),
    });
    return null;
  },
});
