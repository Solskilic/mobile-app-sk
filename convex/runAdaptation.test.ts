/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import schema from './schema';
import { api, internal } from './_generated/api';

const modules = import.meta.glob('./**/*.ts');
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-15T20:00:00Z')); });
afterEach(() => vi.useRealTimers());
test('manual runs change next-action context and idle re-entry without checking off tasks', async () => {
  const t = convexTest(schema, modules);
  const goalId = await t.run(async ctx => {
    const goalId = await ctx.db.insert('goals', { deviceId: 'runner', text: 'Train for a half marathon; comfortable 5K baseline', title: 'Half marathon', status: 'active', questions: [], currentRung: 0, slipDays: 0, missStreak: 0 });
    for (const forDate of ['2026-11-01', '2026-11-02', '2026-11-03']) await ctx.db.insert('tasks', { deviceId: 'runner', goalId, rungIndex: 0, title: 'Old completed step', why: '', minutes: 10, forDate, status: 'done', shrunk: false });
    await ctx.db.insert('tasks', { deviceId: 'runner', goalId, rungIndex: 0, title: 'Next open step', why: '', minutes: 10, forDate: '2026-11-15', status: 'open', shrunk: false });
    return goalId;
  });
  const args = { deviceId: 'runner', today: '2026-11-15', forDate: '2026-11-16' };
  expect((await t.query(api.routeAdherence.context, args)).rampDay).toBe(1);
  await t.mutation(api.runLog.addSamples, { goalId });
  expect((await t.query(api.routeAdherence.context, args)).rampDay).toBe(1);
  const runId = await t.mutation(api.runLog.add, { goalId, date: '2026-11-15', distanceKm: 5, movingMinutes: 32 });
  const context = await t.query(api.routeAdherence.context, args);
  expect(context.ramp).toBeNull();
  expect(context.activityNote).toContain('2026-11-15');
  const input = (await t.query(internal.goals.liveForAi, { deviceId: 'runner', asOfDate: '2026-11-15' }))[0];
  expect(input.runEvidence).toMatchObject({ provenance: 'manual', count: 1, totalDistance: 5000, totalMovingTime: 1920 });
  const tasks = await t.query(api.tasks.upcoming, { deviceId: 'runner', today: '2026-11-15' });
  expect(tasks.tasks[0].status).toBe('open');
  expect((await t.query(api.goals.get, { goalId }))!.currentRung).toBe(0);
  await t.mutation(api.runLog.remove, { goalId, runId });
  expect((await t.query(api.routeAdherence.context, args)).rampDay).toBe(1);
});
