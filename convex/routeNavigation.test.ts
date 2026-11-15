/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const today = '2026-11-15';
const setup = () => convexTest(schema, modules);
type TestCtx = ReturnType<typeof setup>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

function draft(t: TestCtx, deviceId = 'navigation') {
  return t.run((ctx) =>
    ctx.db.insert('routes', {
      deviceId,
      input: 'Learn guitar',
      dedication: 'steady',
      weeklyHours: 3,
      startDate: today,
      status: 'ready',
      goals: [
        {
          key: 'guitar',
          title: 'Learn guitar',
          summary: 'Learn guitar',
          weeklyHours: 3,
          after: [],
        },
      ],
      stops: [
        {
          key: 'first',
          goalKeys: ['guitar'],
          title: 'Play a chord',
          why: 'First skill',
          identity: 'Chord played',
          milestone: 'Play one chord',
          effortHours: 3,
          minWeeks: 1,
          kind: 'build',
          origin: 'goal',
          dependsOn: [],
        },
      ],
      synergies: [],
      merges: [],
    }),
  );
}

test('replacement drafts never hide the active route or its task controls', async () => {
  const t = setup();
  const activeId = await draft(t);
  await t.mutation(api.route.activate, { routeId: activeId, today });
  vi.setSystemTime(new Date('2026-11-15T12:01:00Z'));
  const draftId = await draft(t);
  for (const status of ['building', 'failed', 'ready'] as const) {
    await t.run((ctx) => ctx.db.patch('routes', draftId, { status }));
    const current = (await t.query(api.route.current, {
      deviceId: 'navigation',
      today,
    }))!;
    expect(current.route._id).toBe(activeId);
    expect(current.route.activatedAt).toBeDefined();
    expect(current.draft?._id).toBe(draftId);
    expect(
      await t.query(internal.route.taskBudget, {
        deviceId: 'navigation',
        today,
        forDate: '2026-11-16',
      }),
    ).toBeGreaterThan(0);
    await t.mutation(api.route.advance, { routeId: activeId, today });
  }
});

test('first drafts remain visible and indexed activation survives many newer drafts', async () => {
  const t = setup();
  const activeId = await draft(t);
  expect(
    (await t.query(api.route.current, { deviceId: 'navigation', today }))!.route
      ._id,
  ).toBe(activeId);
  await t.mutation(api.route.activate, { routeId: activeId, today });
  for (let i = 0; i < 101; i++) await draft(t);
  expect(
    (await t.query(api.route.current, { deviceId: 'navigation', today }))!.route
      ._id,
  ).toBe(activeId);
  await t.mutation(api.route.advance, { routeId: activeId, today });
});

test('completed goals and their gallery and run log stay reachable through paged history', async () => {
  const t = setup();
  const routeId = await draft(t);
  await t.mutation(api.route.activate, { routeId, today });
  const goalId = (await t.query(api.route.get, { routeId, today }))!.route
    .goals[0].goalId!;
  await t.mutation(api.goals.climb, { goalId, today });
  const storageId = await t.run((ctx) =>
    ctx.storage.store(new Blob(['test image'], { type: 'image/png' })),
  );
  await t.mutation(api.gallery.add, {
    goalId,
    storageId,
    caption: 'Verification photo',
  });
  await t.mutation(api.runLog.add, {
    goalId,
    date: today,
    distanceKm: 1,
    movingMinutes: 10,
  });
  vi.setSystemTime(new Date('2026-11-15T12:01:00Z'));
  const nextId = await draft(t);
  await t.mutation(api.route.activate, { routeId: nextId, today });
  const first = await t.query(api.goals.history, {
    deviceId: 'navigation',
    paginationOpts: { numItems: 1, cursor: null },
  });
  expect(first.isDone).toBe(false);
  const second = await t.query(api.goals.history, {
    deviceId: 'navigation',
    paginationOpts: { numItems: 1, cursor: first.continueCursor },
  });
  expect(second.page).toEqual([
    { _id: goalId, title: 'Learn guitar', status: 'done' },
  ]);
  expect((await t.query(api.goals.get, { goalId }))!.status).toBe('done');
  expect(await t.query(api.gallery.list, { goalId })).toHaveLength(1);
  expect(await t.query(api.runLog.list, { goalId })).toHaveLength(1);
  expect(
    (
      await t.query(api.goals.history, {
        deviceId: 'other',
        paginationOpts: { numItems: 20, cursor: null },
      })
    ).page,
  ).toEqual([]);
});
