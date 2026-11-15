import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { DAY } from "./goals";

export const ensureDemo = mutation({
  args: { deviceId: v.string(), tomorrow: v.string() },
  returns: v.null(),
  handler: async (ctx, { deviceId, tomorrow }) => {
    const existing = await ctx.db
      .query("goals")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .first();
    if (existing) return null;
    const now = Date.now();
    const startedAt = now - 3 * 7 * DAY;
    const goalId = await ctx.db.insert("goals", {
      deviceId,
      text: "run 75 miles a month",
      title: "Run 75 miles a month",
      status: "active",
      questions: [
        { question: "How much do you run right now?", options: [], answer: "About 5 miles a week" },
        { question: "How many hours a week can you give it?", options: [], answer: "3-4 hours" },
        { question: "When do you want to get there?", options: [], answer: "By spring" },
      ],
      smart: {
        specific: "Run 75 miles in a single calendar month.",
        measurable: "Monthly mileage logged after every run.",
        achievable: "A provisional 16-week build with gradual increases and room for recovery.",
        relevant: "You want running to feel like part of who you are, not a phase.",
        timeBound: "Hit a 75-mile month by mid-March.",
        statement: "Build gradually from 20 miles a month toward a 75-mile month, adjusting the route as you go.",
      },
      verdict: {
        level: "stretch",
        why: "Going from roughly 20 to 75 miles a month in 16 weeks is doable at 3-4 hours a week, but leaves little room for illness or injury.",
        adjustment: "Treat 60 miles as the win line and 75 as the bonus, and keep one easy week every month.",
      },
      estimateWeeks: 16,
      estimateLabel: "About 16 weeks at 3-4 hours a week",
      currentRung: 1,
      startedAt,
      projectedFinish: startedAt + 16 * 7 * DAY,
      slipDays: 0,
      missStreak: 0,
    });
    const rungs = [
      { title: "5 miles a week", identity: "You're a runner now", milestone: "Three runs in one week", weeks: 3, kind: "build" as const },
      { title: "25 miles a month", identity: "You're a 25-mile runner now", milestone: "25 miles logged in a month", weeks: 4, kind: "build" as const },
      { title: "50 miles a month", identity: "You're a 50-mile runner now", milestone: "50 miles logged in a month", weeks: 5, kind: "build" as const },
      { title: "75 miles a month", identity: "You're a 75-mile runner now", milestone: "75 miles logged in a month", weeks: 4, kind: "build" as const },
    ];
    for (const [index, rung] of rungs.entries()) {
      await ctx.db.insert("rungs", { goalId, index, ...rung, ...(index === 0 ? { completedAt: now - 2 * DAY } : {}) });
    }
    await ctx.db.insert("checkins", { deviceId, goalId, kind: "rungClimbed", note: rungs[0].identity, at: now - 2 * DAY });
    const tasks = [
      { title: "Easy 2-mile run at chatting pace", why: "Steady easy miles are what a 25-mile month is made of.", minutes: 25 },
      { title: "Plan this week's three run days", why: "Fixed days make the 25-mile rung automatic.", minutes: 10 },
      { title: "Stretch calves and hips after work", why: "Keeps you injury-free as mileage climbs.", minutes: 10 },
    ];
    for (const t of tasks) {
      await ctx.db.insert("tasks", { deviceId, goalId, rungIndex: 1, ...t, forDate: tomorrow, status: "open", shrunk: false });
    }
    return null;
  },
});
