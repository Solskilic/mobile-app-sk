import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { occupationEvidence, researchDoc, researchGap, researchPosting, researchResource } from "./researchTypes";

const DAY = 24 * 60 * 60 * 1000;
const MAX_RUNGS = 10;
const STALE_RUN = 12 * 60 * 1000;
const CACHE_TTL = DAY;
const COOLDOWN = 10 * 60 * 1000;

async function latest(ctx: { db: MutationCtx["db"] }, goalId: Id<"goals">) {
  return await ctx.db
    .query("research")
    .withIndex("by_goal", (q) => q.eq("goalId", goalId))
    .order("desc")
    .first();
}

export const get = query({
  args: { goalId: v.id("goals") },
  returns: v.union(v.null(), v.object({
    goal: v.object({ _id: v.id("goals"), title: v.string(), text: v.string(), status: v.string() }),
    run: v.union(researchDoc, v.null()),
    saved: v.union(researchDoc, v.null()),
  })),
  handler: async (ctx, { goalId }) => {
    const goal = await ctx.db.get("goals", goalId);
    if (!goal) return null;
    const runs = await ctx.db
      .query("research")
      .withIndex("by_goal", (q) => q.eq("goalId", goalId))
      .order("desc")
      .take(12);
    return { goal: { _id: goal._id, title: goal.title, text: goal.text, status: goal.status }, run: runs[0] ?? null, saved: runs.find((r) => r.status === "done") ?? null };
  },
});

export const start = mutation({
  args: {
    goalId: v.id("goals"),
    background: v.optional(v.string()),
    location: v.optional(v.string()),
    refresh: v.optional(v.boolean()),
  },
  returns: v.union(v.id("research"), v.null()),
  handler: async (ctx, { goalId, background, location, refresh }) => {
    const goal = await ctx.db.get("goals", goalId);
    if (!goal) throw new ConvexError("Goal not found");
    const previous = await latest(ctx, goalId);
    const now = Date.now();
    if ((background?.length ?? 0) > 3000 || (location?.length ?? 0) > 120) throw new ConvexError("Keep your background under 3,000 characters and your location short.");
    const profile = background === undefined ? previous?.background : background.trim() || undefined;
    const place = location === undefined ? previous?.location : location.trim() || undefined;
    const sameInputs = previous?.background === profile && previous?.location === place;
    if (previous?.status === "running" && now - previous.startedAt < STALE_RUN) return previous._id;
    if (!refresh && sameInputs && previous?.status === "done" && now - previous.startedAt < CACHE_TTL) return previous._id;
    if (previous && previous.status !== "needsBackground" && previous.status !== "running" && now - previous.startedAt < COOLDOWN) {
      throw new ConvexError("Give the sources a few minutes before another search. Your saved research is still here.");
    }
    const recent = await ctx.db.query("research")
      .withIndex("by_device_and_startedAt", (q) => q.eq("deviceId", goal.deviceId).gte("startedAt", now - DAY))
      .take(8);
    if (recent.length >= 8) throw new ConvexError("That's enough fresh research for today. You can still use every saved source.");
    const researchId = await ctx.db.insert("research", {
      goalId,
      deviceId: goal.deviceId,
      status: "running",
      ...(profile ? { background: profile } : {}),
      ...(place ? { location: place } : {}),
      steps: [{ text: "Starting research", at: Date.now() }],
      postings: [],
      gaps: [],
      resources: [],
      addedKeys: previous?.addedKeys ?? [],
      startedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.researchAgent.run, { researchId });
    await ctx.scheduler.runAfter(11 * 60 * 1000, internal.research.expire, { researchId });
    const old = await ctx.db.query("research").withIndex("by_goal", (q) => q.eq("goalId", goalId)).order("desc").take(12);
    for (const row of old.slice(3)) if (now - row.startedAt > DAY) await ctx.db.delete("research", row._id);
    return researchId;
  },
});

export const expire = internalMutation({
  args: { researchId: v.id("research") },
  returns: v.null(),
  handler: async (ctx, { researchId }) => {
    const run = await ctx.db.get("research", researchId);
    if (run?.status === "running") {
      await ctx.db.patch("research", researchId, { status: "failed", finishedAt: Date.now(), error: "This research took too long. Try again; your earlier sources are still saved." });
    }
    return null;
  },
});

export const addStop = mutation({
  args: { researchId: v.id("research"), key: v.string(), weeks: v.number() },
  returns: v.union(v.literal("added"), v.literal("already"), v.literal("full"), v.literal("closed")),
  handler: async (ctx, { researchId, key, weeks }) => {
    if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) throw new ConvexError("Choose a whole number of weeks from 1 to 52 for this stop.");
    const run = await ctx.db.get("research", researchId);
    if (!run || run.status !== "done") throw new ConvexError("Wait for the research to finish before adding a stop.");
    const related = await ctx.db.query("research").withIndex("by_goal", (q) => q.eq("goalId", run.goalId)).order("desc").take(12);
    if (related.some((r) => r.addedKeys.includes(key))) return "already" as const;
    const goal = await ctx.db.get("goals", run.goalId);
    if (!goal || (goal.status !== "active" && goal.status !== "paused")) return "closed" as const;
    const gap = run.gaps.find((g) => g.key === key);
    const resource = run.resources.find((r) => r.key === key);
    const stop = gap
      ? { title: gap.stopTitle, milestone: gap.milestone, identity: `You can show ${gap.skill} now` }
      : resource
        ? {
            title: `${["community", "meetup"].includes(resource.kind) ? "Join" : "Work through"} ${resource.title}`,
            milestone: `${["community", "meetup"].includes(resource.kind) ? "Attend a session or introduce yourself" : "Complete one project or exercise"} with ${resource.title} (${resource.provider}). Source: ${resource.url}`,
            identity: `You've put ${resource.title} into practice`,
          }
        : null;
    if (!stop) throw new ConvexError("Nothing to add");
    const rungs = await ctx.db
      .query("rungs")
      .withIndex("by_goal_and_index", (q) => q.eq("goalId", run.goalId))
      .take(MAX_RUNGS);
    if (rungs.length >= MAX_RUNGS) return "full" as const;
    const at = Math.min(goal.currentRung + 1, rungs.length);
    for (const rung of rungs) {
      if (rung.index >= at) await ctx.db.patch("rungs", rung._id, { index: rung.index + 1 });
    }
    await ctx.db.insert("rungs", {
      goalId: run.goalId,
      index: at,
      title: stop.title,
      identity: stop.identity,
      milestone: stop.milestone,
      weeks,
      kind: "build",
    });
    await ctx.db.patch("goals", run.goalId, {
      estimateWeeks: rungs.reduce((sum, rung) => sum + rung.weeks, weeks),
      estimateLabel: `Your route includes ${weeks} ${weeks === 1 ? "week" : "weeks"} you set aside for this new stop.`,
      ...(goal.projectedFinish ? { projectedFinish: goal.projectedFinish + weeks * 7 * DAY } : {}),
    });
    for (const row of related) await ctx.db.patch("research", row._id, { addedKeys: [...row.addedKeys, key] });
    return "added" as const;
  },
});

export const forAgent = internalQuery({
  args: { researchId: v.id("research") },
  returns: v.union(v.null(), v.object({ run: researchDoc, context: v.string() })),
  handler: async (ctx, { researchId }) => {
    const run = await ctx.db.get("research", researchId);
    if (!run) return null;
    const goal = await ctx.db.get("goals", run.goalId);
    if (!goal) return null;
    const rungs = await ctx.db
      .query("rungs")
      .withIndex("by_goal_and_index", (q) => q.eq("goalId", run.goalId))
      .take(MAX_RUNGS);
    return { run, context: JSON.stringify({ goal: goal.text, smart: goal.smart?.statement, answers: goal.questions, stops: rungs.map((r) => r.title), background: run.background, location: run.location }) };
  },
});

export const step = internalMutation({
  args: { researchId: v.id("research"), text: v.string() },
  returns: v.null(),
  handler: async (ctx, { researchId, text }) => {
    const run = await ctx.db.get("research", researchId);
    if (!run || run.status !== "running") return null;
    await ctx.db.patch("research", researchId, { steps: [...run.steps, { text: text.slice(0, 300), at: Date.now() }].slice(-40) });
    return null;
  },
});

export const patch = internalMutation({
  args: {
    researchId: v.id("research"),
    status: v.optional(v.union(v.literal("running"), v.literal("needsBackground"), v.literal("done"), v.literal("failed"))),
    kind: v.optional(v.union(v.literal("career"), v.literal("hobby"))),
    target: v.optional(v.string()),
    question: v.optional(v.string()),
    summary: v.optional(v.string()),
    occupation: v.optional(v.array(occupationEvidence)),
    notes: v.optional(v.array(v.string())),
    postings: v.optional(v.array(researchPosting)),
    gaps: v.optional(v.array(researchGap)),
    resources: v.optional(v.array(researchResource)),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { researchId, ...fields }) => {
    const run = await ctx.db.get("research", researchId);
    if (!run || run.status !== "running" || !(await ctx.db.get("goals", run.goalId))) return null;
    const finished = fields.status && fields.status !== "running";
    await ctx.db.patch("research", researchId, { ...fields, ...(finished ? { finishedAt: Date.now() } : {}) });
    return null;
  },
});
