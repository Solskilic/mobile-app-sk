import { v } from 'convex/values';
import { mutation, query, type QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import schema from './schema';
import { MAX_MANUAL_RUNS, MAX_SAMPLE_RUNS, runEvidenceValidator } from './runLogTypes';

const DAY = 24 * 60 * 60 * 1000;
const goalArgs = { goalId: v.id('goals') };

function parseDate(date: string) {
  const time = Date.parse(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== date) {
    throw new Error('Use a valid date in YYYY-MM-DD format.');
  }
  return time;
}

export async function readRunEvidence(ctx: QueryCtx, { goalId, asOfDate }: { goalId: Id<'goals'>; asOfDate: string }) {
  const asOf = parseDate(asOfDate);
  const since = new Date(asOf - 29 * DAY).toISOString().slice(0, 10);
  const exists = Boolean(await ctx.db.get('goals', goalId));
  const runs = exists ? await ctx.db.query('runLogs').withIndex('by_goal_and_provenance_and_date', q => q.eq('goalId', goalId)
    .eq('provenance', 'manual').gte('date', since).lte('date', asOfDate)).order('desc').take(MAX_MANUAL_RUNS) : [];
  return {
    provenance: 'manual' as const,
    asOfDate,
    latestRunDate: runs[0]?.date ?? null,
    count: runs.length,
    totalDistance: runs.reduce((sum, run) => sum + run.distance, 0),
    totalMovingTime: runs.reduce((sum, run) => sum + run.movingTime, 0),
  };
}

export const summary = query({
  args: { ...goalArgs, asOfDate: v.string() }, returns: runEvidenceValidator,
  handler: readRunEvidence,
});

export const list = query({
  args: goalArgs, returns: v.array(schema.doc('runLogs')),
  handler: async (ctx, { goalId }) => {
    if (!await ctx.db.get('goals', goalId)) return [];
    const [manual, sample] = await Promise.all([
      ctx.db.query('runLogs').withIndex('by_goal_and_provenance_and_date', q => q.eq('goalId', goalId).eq('provenance', 'manual')).order('desc').take(MAX_MANUAL_RUNS),
      ctx.db.query('runLogs').withIndex('by_goal_and_provenance_and_date', q => q.eq('goalId', goalId).eq('provenance', 'sample')).order('desc').take(MAX_SAMPLE_RUNS),
    ]);
    return [...manual, ...sample];
  },
});

export const add = mutation({
  args: { ...goalArgs, date: v.string(), distanceKm: v.number(), movingMinutes: v.number() }, returns: v.id('runLogs'),
  handler: async (ctx, { goalId, date, distanceKm, movingMinutes }) => {
    if (!await ctx.db.get('goals', goalId)) throw new Error('Goal not found.');
    parseDate(date);
    if (date > new Date(Date.now()).toISOString().slice(0, 10)) throw new Error('Choose today or an earlier date (UTC).');
    if (!Number.isFinite(distanceKm) || distanceKm <= 0 || distanceKm > 1000) throw new Error('Enter a distance above 0 and up to 1,000 km.');
    if (!Number.isFinite(movingMinutes) || movingMinutes <= 0 || movingMinutes > 10080) throw new Error('Enter moving minutes above 0 and up to 10,080.');
    const distance = Math.round(distanceKm * 1000);
    const movingTime = Math.round(movingMinutes * 60);
    if (distance < 1 || movingTime < 1) throw new Error('Use at least 1 metre and 1 second.');
    const existing = await ctx.db.query('runLogs').withIndex('by_goal_and_provenance_and_date', q => q.eq('goalId', goalId).eq('provenance', 'manual')).take(MAX_MANUAL_RUNS);
    const duplicate = existing.find(run => run.date === date && run.distance === distance && run.movingTime === movingTime);
    if (duplicate) return duplicate._id;
    if (existing.length >= MAX_MANUAL_RUNS) throw new Error('This demo holds 100 manual runs per goal. Remove one to add another.');
    return ctx.db.insert('runLogs', { goalId, provenance: 'manual', date, distance, movingTime, addedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { ...goalArgs, runId: v.id('runLogs') }, returns: v.null(),
  handler: async (ctx, { goalId, runId }) => {
    const run = await ctx.db.get('runLogs', runId);
    if (run && run.goalId !== goalId) throw new Error('Run does not belong to this goal.');
    if (run) await ctx.db.delete('runLogs', runId);
    return null;
  },
});

export const addSamples = mutation({
  args: goalArgs, returns: v.null(),
  handler: async (ctx, { goalId }) => {
    if (!await ctx.db.get('goals', goalId)) throw new Error('Goal not found.');
    const existing = await ctx.db.query('runLogs').withIndex('by_goal_and_provenance_and_date', q => q.eq('goalId', goalId).eq('provenance', 'sample')).take(MAX_SAMPLE_RUNS);
    if (existing.length) return null;
    for (const [i, distance] of [3000, 4200, 5000].entries()) {
      await ctx.db.insert('runLogs', { goalId, provenance: 'sample', distance, movingTime: [1320, 1800, 2160][i],
        date: new Date(Date.now() - (7 - i * 2) * DAY).toISOString().slice(0, 10), addedAt: Date.now() });
    }
    return null;
  },
});

