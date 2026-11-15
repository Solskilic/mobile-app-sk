/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import schema from './schema';
import { api, internal } from './_generated/api';

const modules = import.meta.glob('./**/*.ts');
const setup = () => convexTest(schema, modules);
const today = '2026-11-15';
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('weekly hours are independent of dedication and survive refresh', async () => {
  const t = setup();
  const id = await t.mutation(api.route.create, { deviceId: 'hours', input: 'Run and make friends', dedication: 'allIn', weeklyHours: 2, today });
  const route = (await t.query(api.route.get, { routeId: id, today }))!.route;
  expect(route.weeklyHours).toBe(2);
  await t.mutation(api.route.setDedication, { routeId: id, dedication: 'casual' });
  expect((await t.query(api.route.get, { routeId: id, today }))!.plan.capacity).toBe(2);
  await expect(t.mutation(api.route.create, { deviceId: 'other', input: 'Run', dedication: 'steady', weeklyHours: 0, today })).rejects.toThrow('1 and 40');
});

test('a cited research stop joins the route graph and remains actionable after climbing', async () => {
  const t = setup();
  const routeId = await t.run(ctx => ctx.db.insert('routes', {
    deviceId: 'research-route', input: 'Learn UX', dedication: 'steady', startDate: today, status: 'ready',
    goals: [{ key: 'ux', title: 'Learn UX', summary: 'Change to UX', weeklyHours: 3, after: [] }],
    stops: ['first', 'second'].map((key, i) => ({ key, goalKeys: ['ux'], title: key, why: key, identity: key, milestone: key, effortHours: 3, minWeeks: 1, kind: 'build' as const, origin: 'goal' as const, dependsOn: i ? ['first'] : [] })), synergies: [], merges: [],
  }));
  await t.mutation(api.route.setCurrentContext, { routeId, context: 'I have no design experience and two evenings a week.' });
  await t.mutation(api.route.activate, { routeId, today });
  const goalId = (await t.query(api.route.get, { routeId, today }))!.route.goals[0].goalId!;
  expect((await t.query(api.goals.get, { goalId }))!.text).toContain('no design experience');
  const researchId = await t.run(ctx => ctx.db.insert('research', { goalId, deviceId: 'research-route', status: 'done', background: 'Biology', steps: [], postings: [], gaps: [{ key: 'gap:proto', skill: 'Prototyping', status: 'missing', why: 'No experience', stopTitle: 'Prototype one flow', milestone: 'Show a flow', sources: [] }], resources: [], addedKeys: [], startedAt: Date.now() }));
  expect(await t.mutation(api.research.addStop, { researchId, key: 'gap:proto', weeks: 3 })).toBe('added');
  const route = (await t.query(api.route.get, { routeId, today }))!.route;
  const newStop = route.stops.find(s => s.key.startsWith('research:'))!;
  expect(newStop.minWeeks).toBe(3);
  expect(route.stops.find(s => s.key === 'second')!.dependsOn).toContain(newStop.key);
  await t.mutation(api.goals.climb, { goalId, today });
  const live = await t.query(internal.goals.liveForAi, { deviceId: 'research-route' });
  expect(live[0].rungs.find(r => r.index === live[0].currentRung)?.routeStopKey).toBe(newStop.key);
  expect((await t.query(api.goals.get, { goalId }))!.status).toBe('active');
  await expect(t.mutation(api.route.setCurrentContext, { routeId, context: 'New baseline' })).rejects.toThrow('already in use');
});

test('investment banking asks for background, location and entry role before a route', async () => {
  const t = setup();
  const input = { deviceId: 'banking', input: 'I want to pivot to investment banking.', dedication: 'steady' as const, weeklyHours: 4, today };
  await expect(t.mutation(api.route.create, input)).rejects.toThrow('background, location and target entry role');
  await expect(t.mutation(api.route.create, { ...input, careerContext: { background: 'Economics graduate, no banking experience', location: 'London', targetRole: '' } })).rejects.toThrow('entry role');
  const id = await t.mutation(api.route.create, { ...input, careerContext: { background: 'Economics graduate, Excel, no banking experience', location: 'London', targetRole: 'Not sure: analyst vs associate' }, goalHorizons: [{ goal: input.input, horizon: { kind: 'exploration' } }] });
  const result = (await t.query(api.route.get, { routeId: id, today }))!;
  expect(result.route.status).toBe('building');
  expect(result.route.careerContext?.targetRole).toContain('Not sure');
  expect(result.route.input).toBe(input.input);
  expect(result.route.goalHorizons?.[0].horizon.kind).toBe('exploration');
});
