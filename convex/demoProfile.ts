import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import schema from './schema';
import {
  demoProfileFields,
  profileContext,
  validateDemoProfile,
} from './demoProfileTypes';
import { syncRoute } from './route';

export const get = query({
  args: { deviceId: v.string() },
  returns: v.union(v.null(), schema.doc('demoProfiles')),
  handler: (ctx, { deviceId }) =>
    ctx.db
      .query('demoProfiles')
      .withIndex('by_device', (q) => q.eq('deviceId', deviceId))
      .unique(),
});

export const save = mutation({
  args: {
    deviceId: v.string(),
    ...demoProfileFields,
    today: v.string(),
    applyToActive: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { deviceId, today, applyToActive, ...profile }) => {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(today) ||
      !Number.isFinite(Date.parse(today)) ||
      new Date(today).toISOString().slice(0, 10) !== today
    )
      throw new Error('Use a valid date');
    validateDemoProfile(profile);
    const old = await ctx.db
      .query('demoProfiles')
      .withIndex('by_device', (q) => q.eq('deviceId', deviceId))
      .unique();
    const value = { ...profile, deviceId, updatedAt: Date.now() };
    if (old) await ctx.db.patch('demoProfiles', old._id, value);
    else await ctx.db.insert('demoProfiles', value);
    if (!applyToActive) return null;
    const route = await ctx.db
      .query('routes')
      .withIndex('by_device_and_activatedAt', (q) => q.eq('deviceId', deviceId))
      .order('desc')
      .first();
    if (route?.activatedAt === undefined) return null;
    const context = profileContext(profile);
    const careerContext = route.careerContext
      ? {
          ...route.careerContext,
          background: profile.startingPoint || 'Not sure',
        }
      : undefined;
    await ctx.db.patch('routes', route._id, {
      profileContext: context,
      demoProfile: profile,
      weeklyHours: profile.weeklyHours,
      ...(careerContext ? { careerContext } : {}),
    });
    for (const g of route.goals)
      if (g.goalId) {
        const goal = await ctx.db.get('goals', g.goalId);
        if (goal)
          await ctx.db.patch('goals', goal._id, {
            text: `${g.summary} ${context}${route.currentContext ? ` Current constraints: ${route.currentContext}` : ''}${careerContext ? ` Career context: ${JSON.stringify(careerContext)}` : ''}`,
          });
      }
    await syncRoute(ctx, route._id, today);
    return null;
  },
});
