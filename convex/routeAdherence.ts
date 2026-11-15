import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, query, type QueryCtx } from "./_generated/server";
import { adherence, addDays, DAY_NAMES, weekdayOf, type Outcome } from "./routeEngine";

type TaskOutcome = Pick<Doc<"tasks">, "forDate" | "status" | "minutes" | "completedAt">;
type Ramp = Pick<Doc<"ramps">, "startDate" | "endDate" | "reason">;
type Dates = { deviceId: string; today: string; forDate: string };

const args = { deviceId: v.string(), today: v.string(), forDate: v.string() };
const rampValidator = v.object({ startDate: v.string(), endDate: v.string(), reason: v.string() });
const summaryValidator = v.object({
  minutesCap: v.number(),
  explanation: v.string(),
  ramp: v.union(rampValidator, v.null()),
  rampDay: v.union(v.number(), v.null()),
});
const modelValidator = v.object({
  state: v.union(v.literal("new"), v.literal("onTrack"), v.literal("drifting"), v.literal("lapsed")),
  pace: v.number(),
  minutesCap: v.number(),
  weekdayStrength: v.array(v.number()),
  missedDaysInRow: v.number(),
  idleDays: v.number(),
  resolved: v.number(),
  shortBeatsLong: v.boolean(),
  bestDays: v.array(v.number()),
  weakDays: v.array(v.number()),
});
const contextValidator = v.object({
  model: modelValidator,
  summary: summaryValidator,
  newRamp: v.union(rampValidator, v.null()),
});

function validateDate(key: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || addDays(key, 0) !== key) throw new Error("Expected a calendar date: YYYY-MM-DD");
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export function buildAdherenceContext(tasks: TaskOutcome[], latestRamp: Ramp | null, today: string, forDate: string) {
  validateDate(today);
  validateDate(forDate);
  const outcomes: Outcome[] = tasks.filter((t) => t.forDate < today).map((t) => ({
    forDate: t.forDate,
    minutes: t.minutes,
    status: t.status === "done" ? "done" : "missed",
  }));
  const model = adherence(outcomes, today);
  const dates = outcomes.map((o) => o.forDate).sort();
  const lastDone = outcomes.filter((o) => o.status === "done").map((o) => o.forDate).sort().pop();
  const idleSince = lastDone ?? dates[0];
  model.idleDays = idleSince ? Math.max(0, daysBetween(idleSince, today) - 1) : 0;
  if (model.idleDays >= 4 || model.missedDaysInRow >= 3) model.state = "lapsed";
  else if (model.missedDaysInRow >= 2) model.state = "drifting";

  const needsReentry = model.missedDaysInRow >= 2 || model.idleDays >= 4;
  const newMiss = outcomes.some((o) => o.status === "missed" && (!latestRamp || o.forDate > latestRamp.endDate));
  const canStart = !latestRamp || (today > latestRamp.endDate && newMiss);
  const startDate = forDate > today ? forDate : today;
  const newRamp = needsReentry && canStart && forDate >= today ? {
    startDate,
    endDate: addDays(startDate, 2),
    reason: model.missedDaysInRow >= 2
      ? "A few days did not go to plan, so the next three days build back gently."
      : "It has been a little while, so the next three days ease you back in.",
  } : null;
  const ramp = newRamp ?? (latestRamp ? { startDate: latestRamp.startDate, endDate: latestRamp.endDate, reason: latestRamp.reason } : null);
  const rampDay = ramp && forDate >= ramp.startDate && forDate <= ramp.endDate
    ? daysBetween(ramp.startDate, forDate) + 1 : null;
  const weakDay = model.weakDays.includes(weekdayOf(forDate));
  const minutesCap = Math.min(model.minutesCap, model.shortBeatsLong ? 10 : 30, weakDay ? 15 : 30, rampDay ? [10, 15, 20][rampDay - 1] : 30);
  const explanation = rampDay
    ? `Day ${rampDay} of your gentle restart: keep each step to ${minutesCap} minutes or less.`
    : weakDay
      ? `${DAY_NAMES[weekdayOf(forDate)]} have been harder to fit in, so these steps stay small.`
      : model.shortBeatsLong
        ? "Short sessions have been easier to finish, so these steps stay small."
        : model.resolved === 0
          ? "Start with a few manageable steps; your route will adapt as you go."
          : "Your next steps fit the pace you have been able to keep.";
  return {
    model,
    summary: { minutesCap, explanation, ramp: rampDay ? ramp : null, rampDay },
    newRamp,
  };
}

export async function readAdherenceContext(ctx: QueryCtx, input: Dates) {
  validateDate(input.today);
  validateDate(input.forDate);
  const [tasks, latestRamp] = await Promise.all([
    ctx.db.query("tasks")
      .withIndex("by_device_and_forDate", (q) => q.eq("deviceId", input.deviceId).lt("forDate", input.today))
      .order("desc").take(512),
    ctx.db.query("ramps")
      .withIndex("by_device_and_endDate", (q) => q.eq("deviceId", input.deviceId))
      .order("desc").first(),
  ]);
  return buildAdherenceContext(tasks, latestRamp, input.today, input.forDate);
}

export const context = query({
  args,
  returns: summaryValidator,
  handler: async (ctx, input) => (await readAdherenceContext(ctx, input)).summary,
});

export const forAi = internalQuery({
  args,
  returns: contextValidator,
  handler: readAdherenceContext,
});

export const prepare = internalMutation({
  args,
  returns: contextValidator,
  handler: async (ctx, input) => {
    const context = await readAdherenceContext(ctx, input);
    if (context.newRamp) await ctx.db.insert("ramps", { deviceId: input.deviceId, ...context.newRamp });
    return context;
  },
});
