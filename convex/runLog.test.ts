/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import schema from './schema';
import { api } from './_generated/api';
import { readRunEvidence } from './runLog';

const modules = import.meta.glob('./**/*.ts');
const setup = () => convexTest(schema, modules);
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-15T20:00:00Z')); });
afterEach(() => vi.useRealTimers());

async function goal(t: ReturnType<typeof setup>) {
  return t.run(ctx => ctx.db.insert('goals', { deviceId: 'run-demo', text: 'Run a half marathon', title: 'Half marathon', status: 'active', questions: [], currentRung: 0, slipDays: 0, missStreak: 0 }));
}

test('manual logs store canonical units and dates idempotently, newest first, with no completion side effects', async () => {
  const t = setup(); const goalId = await goal(t);
  const taskId = await t.run(ctx => ctx.db.insert('tasks', { deviceId: 'run-demo', goalId, rungIndex: 0, title: 'A gentle run', why: 'Build a rhythm', minutes: 20, forDate: '2026-11-15', status: 'open', shrunk: false }));
  const before = await t.run(async ctx => ({ goal: await ctx.db.get('goals', goalId), task: await ctx.db.get('tasks', taskId) }));
  const args = { goalId, date: '2026-11-12', distanceKm: 5.125, movingMinutes: 30.5 };
  const first = await t.mutation(api.runLog.add, args);
  expect(await t.mutation(api.runLog.add, args)).toBe(first);
  await t.mutation(api.runLog.add, { ...args, date: '2026-11-15', distanceKm: 3 });
  const runs = await t.query(api.runLog.list, { goalId });
  expect(runs).toHaveLength(2);
  expect(runs.map(run => run.date)).toEqual(['2026-11-15', '2026-11-12']);
  expect(runs[1]).toMatchObject({ provenance: 'manual', distance: 5125, movingTime: 1830 });
  expect(runs[1].addedAt).toBe(runs[1]._creationTime);
  expect(await t.run(async ctx => ({ goal: await ctx.db.get('goals', goalId), task: await ctx.db.get('tasks', taskId) }))).toEqual(before);
  expect(await t.run(ctx => ctx.db.query('checkins').withIndex('by_goal', q => q.eq('goalId', goalId)).take(10))).toEqual([]);
});

test('real evidence uses only this goal’s manual runs in the inclusive last 30 days and excludes samples', async () => {
  const t = setup(); const goalId = await goal(t); const other = await goal(t);
  for (const date of ['2026-10-16', '2026-10-17', '2026-11-15']) {
    await t.mutation(api.runLog.add, { goalId, date, distanceKm: 5, movingMinutes: 30 });
  }
  await t.mutation(api.runLog.add, { goalId: other, date: '2026-11-15', distanceKm: 50, movingMinutes: 300 });
  await t.mutation(api.runLog.addSamples, { goalId });
  await t.mutation(api.runLog.addSamples, { goalId });
  const args = { goalId, asOfDate: '2026-11-15' };
  const expected = { provenance: 'manual', asOfDate: '2026-11-15', latestRunDate: '2026-11-15', count: 2, totalDistance: 10000, totalMovingTime: 3600 };
  expect(await t.query(api.runLog.summary, args)).toEqual(expected);
  expect(await t.run(ctx => readRunEvidence(ctx, args))).toEqual(expected);
  expect((await t.query(api.runLog.list, { goalId })).filter(run => run.provenance === 'sample')).toHaveLength(3);
  const earlier = await t.query(api.runLog.summary, { goalId, asOfDate: '2026-11-14' });
  expect(earlier).toMatchObject({ latestRunDate: '2026-10-17', count: 2, totalDistance: 10000 });
});

test('sample-only evidence is empty and removal updates real evidence without changing goal or task', async () => {
  const t = setup(); const goalId = await goal(t);
  await t.mutation(api.runLog.addSamples, { goalId });
  expect(await t.query(api.runLog.summary, { goalId, asOfDate: '2026-11-15' })).toMatchObject({ latestRunDate: null, count: 0, totalDistance: 0, totalMovingTime: 0 });
  const runId = await t.mutation(api.runLog.add, { goalId, date: '2026-11-14', distanceKm: 5, movingMinutes: 30 });
  const before = await t.run(ctx => ctx.db.get('goals', goalId));
  await t.mutation(api.runLog.remove, { goalId, runId });
  await t.mutation(api.runLog.remove, { goalId, runId });
  expect(await t.query(api.runLog.summary, { goalId, asOfDate: '2026-11-15' })).toMatchObject({ latestRunDate: null, count: 0 });
  expect(await t.run(ctx => ctx.db.get('goals', goalId))).toEqual(before);
});

test.each([
  { date: '2026-02-30' }, { date: '2026-13-01' }, { date: 'November 15' }, { date: '2026-11-16' },
  { distanceKm: -1 }, { distanceKm: 0 }, { distanceKm: NaN }, { distanceKm: Infinity }, { distanceKm: 1001 }, { distanceKm: 0.0001 },
  { movingMinutes: -1 }, { movingMinutes: 0 }, { movingMinutes: NaN }, { movingMinutes: Infinity }, { movingMinutes: 10081 }, { movingMinutes: 0.001 },
])('rejects invalid run data: %j', async invalid => {
  const t = setup(); const goalId = await goal(t);
  await expect(t.mutation(api.runLog.add, { goalId, date: '2026-11-15', distanceKm: 5, movingMinutes: 30, ...invalid })).rejects.toThrow();
  expect(await t.query(api.runLog.list, { goalId })).toEqual([]);
});

test('caps manual storage at 100, keeps retries idempotent at the cap, and isolates removal by goal', async () => {
  const t = setup(); const goalId = await goal(t); const other = await goal(t);
  for (let i = 1; i <= 100; i++) await t.mutation(api.runLog.add, { goalId, date: '2026-11-15', distanceKm: i, movingMinutes: 30 });
  const runs = await t.query(api.runLog.list, { goalId });
  expect(runs).toHaveLength(100);
  expect(await t.mutation(api.runLog.add, { goalId, date: '2026-11-15', distanceKm: 1, movingMinutes: 30 })).toBe(runs.find(run => run.distance === 1000)!._id);
  await expect(t.mutation(api.runLog.add, { goalId, date: '2026-11-15', distanceKm: 101, movingMinutes: 30 })).rejects.toThrow('100 manual runs');
  await expect(t.mutation(api.runLog.remove, { goalId: other, runId: runs[0]._id })).rejects.toThrow('does not belong');
  await t.mutation(api.runLog.remove, { goalId, runId: runs[0]._id });
  await t.mutation(api.runLog.add, { goalId, date: '2026-11-15', distanceKm: 101, movingMinutes: 30 });
  expect(await t.query(api.runLog.list, { goalId })).toHaveLength(100);
});

test('deleted goals expose no stale evidence and reject new logs and samples', async () => {
  const t = setup(); const goalId = await goal(t);
  await t.mutation(api.runLog.add, { goalId, date: '2026-11-15', distanceKm: 5, movingMinutes: 30 });
  await t.run(ctx => ctx.db.delete('goals', goalId));
  expect(await t.query(api.runLog.list, { goalId })).toEqual([]);
  expect(await t.query(api.runLog.summary, { goalId, asOfDate: '2026-11-15' })).toMatchObject({ count: 0, latestRunDate: null });
  await expect(t.mutation(api.runLog.add, { goalId, date: '2026-11-15', distanceKm: 5, movingMinutes: 30 })).rejects.toThrow('Goal not found');
  await expect(t.mutation(api.runLog.addSamples, { goalId })).rejects.toThrow('Goal not found');
  await expect(t.query(api.runLog.summary, { goalId, asOfDate: '2026-02-30' })).rejects.toThrow('valid date');
});

