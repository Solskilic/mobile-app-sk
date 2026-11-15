import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { addDays } from "./routeEngine";

import { DEMO_GOALS, DEMO_INPUT, DEMO_STOPS } from "./routeSample";

export const ensure = mutation({
  args: { deviceId: v.string(), today: v.string() },
  returns: v.id("routes"),
  handler: async (ctx, { deviceId, today }) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || addDays(today, 0) !== today) throw new Error("Expected a calendar date");
    const existing = await ctx.db.query("routes").withIndex("by_device", (q) => q.eq("deviceId", deviceId)).order("desc").first();
    if (existing) return existing._id;
    return await ctx.db.insert("routes", {
      deviceId, input: DEMO_INPUT, dedication: "steady", startDate: today, status: "ready", sample: true,
      goals: DEMO_GOALS, stops: DEMO_STOPS,
      synergies: [
        { stopKey: "club", goalKeys: ["run", "friends"], reason: "Easy miles, familiar faces" },
        { stopKey: "sketch", goalKeys: ["ux", "art"], reason: "Draw your way into design" },
      ],
      merges: [],
    });
  },
});
