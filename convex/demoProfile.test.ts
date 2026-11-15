/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import schema from './schema';
import { api, internal } from './_generated/api';
import { profileContext } from './demoProfileTypes';

const modules = import.meta.glob('./**/*.ts');
const today = '2026-11-15';
const sample = {
  fictional: true as const,
  startingPoint: 'Fictional graduate; beginner guitarist',
  motivation: 'Play songs for enjoyment',
  constraints: 'Ten-minute evenings',
  structure: 'flexible' as const,
  weeklyHours: 2,
};

test('a new draft stores fictional answers without overwriting the active demo profile', async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.demoProfile.save, {
    deviceId: 'draft-profile',
    ...sample,
    today,
    applyToActive: false,
  });
  const routeId = await t.mutation(api.route.create, {
    deviceId: 'draft-profile',
    input: 'Learn piano',
    dedication: 'steady',
    weeklyHours: 8,
    demoProfile: { ...sample, weeklyHours: 3, constraints: 'Weekends only' },
    today,
  });
  const route = (await t.query(api.route.get, { routeId, today }))!.route;
  expect(route.weeklyHours).toBe(3);
  expect(route.profileContext).toContain('Weekends only');
  expect(
    await t.query(api.demoProfile.get, { deviceId: 'draft-profile' }),
  ).toMatchObject({ constraints: 'Ten-minute evenings', weeklyHours: 2 });
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

test('fictional demo answers persist, can be corrected, and are separated by demo namespace', async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.demoProfile.save, {
    deviceId: 'profile-test',
    ...sample,
    today,
    applyToActive: false,
  });
  expect(
    await t.query(api.demoProfile.get, { deviceId: 'profile-test' }),
  ).toMatchObject(sample);
  expect(
    await t.query(api.demoProfile.get, { deviceId: 'other-demo' }),
  ).toBeNull();
  await t.mutation(api.demoProfile.save, {
    deviceId: 'profile-test',
    ...sample,
    constraints: 'Weekends only',
    structure: 'routine',
    today,
    applyToActive: false,
  });
  expect(
    await t.query(api.demoProfile.get, { deviceId: 'profile-test' }),
  ).toMatchObject({
    constraints: 'Weekends only',
    structure: 'routine',
    fictional: true,
  });
  await expect(
    t.mutation(api.demoProfile.save, {
      deviceId: 'profile-test',
      ...sample,
      weeklyHours: 0,
      today,
      applyToActive: false,
    }),
  ).rejects.toThrow('1 and 40');
  await expect(
    t.mutation(api.demoProfile.save, {
      deviceId: 'profile-test',
      ...sample,
      motivation: 'x'.repeat(601),
      today,
      applyToActive: false,
    }),
  ).rejects.toThrow('600');
});

test('profile context survives route activation and edits feed future AI actions without completing work', async () => {
  const t = convexTest(schema, modules);
  const routeId = await t.run((ctx) =>
    ctx.db.insert('routes', {
      deviceId: 'profile-test',
      input: 'Learn guitar',
      dedication: 'steady',
      weeklyHours: 2,
      profileContext: profileContext(sample),
      demoProfile: sample,
      startDate: today,
      status: 'ready',
      goals: [
        {
          key: 'guitar',
          title: 'Learn guitar',
          summary: 'Play a song',
          weeklyHours: 2,
          after: [],
        },
      ],
      stops: [
        {
          key: 'chord',
          goalKeys: ['guitar'],
          title: 'Play a chord',
          why: 'Skill prerequisite',
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
  expect(
    await t.query(api.demoProfile.get, { deviceId: 'profile-test' }),
  ).toBeNull();
  await t.mutation(api.route.activate, { routeId, today });
  expect(
    await t.query(api.demoProfile.get, { deviceId: 'profile-test' }),
  ).toMatchObject(sample);
  const goalId = (await t.query(api.route.get, { routeId, today }))!.route
    .goals[0].goalId!;
  expect(
    (
      await t.query(internal.goals.liveForAi, {
        deviceId: 'profile-test',
        asOfDate: today,
      })
    )[0].text,
  ).toContain('Ten-minute evenings');
  await t.mutation(api.demoProfile.save, {
    deviceId: 'profile-test',
    ...sample,
    constraints: 'Weekend mornings',
    structure: 'routine',
    weeklyHours: 3,
    today,
    applyToActive: true,
  });
  const route = (await t.query(api.route.get, { routeId, today }))!;
  expect(route.plan.capacity).toBe(3);
  const input = (
    await t.query(internal.goals.liveForAi, {
      deviceId: 'profile-test',
      asOfDate: today,
    })
  )[0];
  expect(input.text).toContain('Weekend mornings');
  expect(input.text).toContain('consistent time slots');
  expect(input.text).toContain('Play songs for enjoyment');
  const goal = (await t.query(api.goals.get, { goalId }))!;
  expect(goal.currentRung).toBe(0);
  expect(goal.rungs[0].completedAt).toBeUndefined();
  await t.mutation(api.goals.renameDemo, {
    goalId,
    title: 'Guitar practice',
    fictional: true,
  });
  expect(
    (await t.query(api.route.get, { routeId, today }))!.route.goals[0].title,
  ).toBe('Guitar practice');
  expect((await t.query(api.goals.get, { goalId }))!.rungs[0].title).toBe(
    'Play a chord',
  );
});
