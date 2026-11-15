import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const goalStatus = v.union(
  v.literal("clarifying"),
  v.literal("planning"),
  v.literal("active"),
  v.literal("paused"),
  v.literal("done"),
  v.literal("failed"),
);

export const smartValidator = v.object({
  specific: v.string(),
  measurable: v.string(),
  achievable: v.string(),
  relevant: v.string(),
  timeBound: v.string(),
  statement: v.string(),
});

export const verdictValidator = v.object({
  level: v.union(v.literal("realistic"), v.literal("stretch"), v.literal("unrealistic")),
  why: v.string(),
  adjustment: v.string(),
});

export const resourceValidator = v.object({
  name: v.string(),
  type: v.string(),
  why: v.string(),
  url: v.string(),
});

export const horizonValidator = v.object({
  kind: v.union(v.literal("flexible"), v.literal("byDate"), v.literal("recurring"), v.literal("exploration")),
  date: v.optional(v.string()),
  detail: v.optional(v.string()),
});

export default defineSchema({
  goals: defineTable({
    deviceId: v.string(),
    text: v.string(),
    title: v.string(),
    status: goalStatus,
    questions: v.array(
      v.object({
        question: v.string(),
        options: v.array(v.string()),
        answer: v.optional(v.string()),
      }),
    ),
    smart: v.optional(smartValidator),
    verdict: v.optional(verdictValidator),
    estimateWeeks: v.optional(v.number()),
    estimateLabel: v.optional(v.string()),
    currentRung: v.number(),
    startedAt: v.optional(v.number()),
    projectedFinish: v.optional(v.number()),
    slipDays: v.number(),
    missStreak: v.number(),
    minutesCap: v.optional(v.number()),
    coachNote: v.optional(v.object({ text: v.string(), at: v.number() })),
    resources: v.optional(v.array(resourceValidator)),
    researching: v.optional(v.boolean()),
    error: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    routeId: v.optional(v.id("routes")),
  })
    .index("by_device", ["deviceId"])
    .index("by_device_and_status", ["deviceId", "status"]),

  rungs: defineTable({
    goalId: v.id("goals"),
    index: v.number(),
    title: v.string(),
    identity: v.string(),
    milestone: v.string(),
    weeks: v.number(),
    kind: v.union(v.literal("explore"), v.literal("build")),
    completedAt: v.optional(v.number()),
    routeStopKey: v.optional(v.string()),
  }).index("by_goal_and_index", ["goalId", "index"]),

  tasks: defineTable({
    deviceId: v.string(),
    goalId: v.id("goals"),
    rungIndex: v.number(),
    title: v.string(),
    why: v.string(),
    minutes: v.number(),
    forDate: v.string(),
    status: v.union(v.literal("open"), v.literal("done"), v.literal("missed")),
    shrunk: v.boolean(),
    completedAt: v.optional(v.number()),
  })
    .index("by_device_and_forDate", ["deviceId", "forDate"])
    .index("by_goal_and_status", ["goalId", "status"]),

  planner: defineTable({
    deviceId: v.string(),
    running: v.boolean(),
    error: v.optional(v.string()),
  }).index("by_device", ["deviceId"]),

  checkins: defineTable({
    deviceId: v.string(),
    goalId: v.id("goals"),
    taskId: v.optional(v.id("tasks")),
    kind: v.union(
      v.literal("done"),
      v.literal("missed"),
      v.literal("shrunkWeek"),
      v.literal("rungClimbed"),
      v.literal("goalDone"),
    ),
    note: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_device", ["deviceId"])
    .index("by_goal", ["goalId"]),

  routes: defineTable({
    deviceId: v.string(),
    input: v.string(),
    dedication: v.union(v.literal("casual"), v.literal("steady"), v.literal("allIn")),
    timelineWeeks: v.optional(v.number()),
    goalHorizons: v.optional(v.array(v.object({ goal: v.string(), horizon: horizonValidator }))),
    startDate: v.string(),
    status: v.union(v.literal("building"), v.literal("ready"), v.literal("failed")),
    stage: v.optional(v.string()),
    error: v.optional(v.string()),
    activatedAt: v.optional(v.number()),
    sample: v.optional(v.boolean()),
    goals: v.array(
      v.object({
        key: v.string(),
        title: v.string(),
        summary: v.string(),
        weeklyHours: v.number(),
        after: v.array(v.string()),
        afterWhy: v.optional(v.string()),
        goalId: v.optional(v.id("goals")),
        horizon: v.optional(horizonValidator),
      }),
    ),
    stops: v.array(
      v.object({
        key: v.string(),
        goalKeys: v.array(v.string()),
        title: v.string(),
        why: v.string(),
        identity: v.string(),
        milestone: v.string(),
        effortHours: v.number(),
        minWeeks: v.number(),
        kind: v.union(v.literal("explore"), v.literal("build")),
        dependsOn: v.array(v.string()),
        origin: v.union(v.literal("goal"), v.literal("merged"), v.literal("bridge")),
      }),
    ),
    synergies: v.array(v.object({ stopKey: v.string(), goalKeys: v.array(v.string()), reason: v.string() })),
    merges: v.array(v.object({ stopKey: v.string(), dropped: v.string(), goalKeys: v.array(v.string()) })),
  }).index("by_device", ["deviceId"]),

  ramps: defineTable({
    deviceId: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    reason: v.string(),
  }).index("by_device_and_endDate", ["deviceId", "endDate"]),
});
