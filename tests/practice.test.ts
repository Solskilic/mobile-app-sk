import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from '../convex/_generated/api';
import schema from '../convex/schema';

const modules = {
  '../convex/_generated/server.ts': () => import('../convex/_generated/server'),
  '../convex/practice.ts': () => import('../convex/practice'),
  '../convex/practiceAi.ts': () => import('../convex/practiceAi'),
  '../convex/tasks.ts': () => import('../convex/tasks'),
  '../convex/goals.ts': () => import('../convex/goals'),
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const goalId = await ctx.db.insert('goals', {
      deviceId: 'test-device',
      text: 'Learn to draw hands',
      title: 'Draw hands',
      status: 'active',
      questions: [],
      currentRung: 0,
      slipDays: 1,
      missStreak: 1,
    });
    const taskId = await ctx.db.insert('tasks', {
      deviceId: 'test-device',
      goalId,
      rungIndex: 0,
      title: 'Draw five hands',
      why: 'Practice simple shapes',
      minutes: 15,
      forDate: '2026-11-15',
      status: 'missed',
      shrunk: false,
    });
    const storageId = await ctx.storage.store(
      new Blob(['test image bytes'], { type: 'image/png' }),
    );
    return { goalId, taskId, storageId };
  });
  return { t, ...ids };
}

describe('content to practice', () => {
  it('attaches a link to the current stop and rejects non-web links', async () => {
    const { t, goalId } = await setup();
    expect(
      await t.mutation(api.practice.addLink, {
        goalId,
        url: 'javascript:alert(1)',
      }),
    ).toBe('badUrl');
    const id = await t.mutation(api.practice.addLink, {
      goalId,
      url: 'https://notyoutube.com/lesson',
    });
    expect(id).not.toBe('badUrl');
    const items = await t.query(api.practice.forGoal, { goalId });
    expect(items).toMatchObject([
      { goalId, rungIndex: 0, source: 'article', status: 'fetching' },
    ]);
  });

  it('asks for one line when a source cannot be fetched, then allows a retry', async () => {
    const { t, goalId } = await setup();
    const practiceId = await t.run(
      async (ctx) =>
        await ctx.db.insert('practice', {
          deviceId: 'test-device',
          goalId,
          rungIndex: 0,
          source: 'article',
          url: 'https://example.com',
          found: '',
          status: 'fetching',
        }),
    );
    await t.action(internal.practiceAi.makeStep, { practiceId });
    expect((await t.query(api.practice.forGoal, { goalId }))[0]).toMatchObject({
      status: 'needsNote',
    });
    await t.mutation(api.practice.addNote, {
      practiceId,
      note: 'Use boxes to draw a hand',
    });
    expect((await t.query(api.practice.forGoal, { goalId }))[0]).toMatchObject({
      status: 'fetching',
      userNote: 'Use boxes to draw a hand',
    });
  });

  it('turns available source evidence into a concrete step with strict JSON', async () => {
    const { t, goalId } = await setup();
    const practiceId = await t.run(
      async (ctx) =>
        await ctx.db.insert('practice', {
          deviceId: 'test-device',
          goalId,
          rungIndex: 0,
          source: 'youtube',
          url: 'https://youtu.be/lesson',
          status: 'fetching',
          found:
            'Title: Draw hands\nTranscript: Start with a box for the palm.',
        }),
    );
    vi.stubEnv('OPENAI_API_KEY', 'test-only-not-a-secret');
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    enough: true,
                    ask: '',
                    title: '15 min: draw five hands with boxes',
                    minutes: 15,
                    howTo: 'Block in the palm, then add fingers.',
                    why: 'Simple forms make complex poses easier to see.',
                  }),
                },
              ],
            },
          ],
        }),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    await t.action(internal.practiceAi.makeStep, { practiceId });
    expect((await t.query(api.practice.forGoal, { goalId }))[0]).toMatchObject({
      status: 'ready',
      title: '15 min: draw five hands with boxes',
      minutes: 15,
      why: 'Simple forms make complex poses easier to see.',
    });
    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.text.format.strict).toBe(true);
    expect(payload.input[1].content).toContain(
      'Start with a box for the palm.',
    );
  });

  it('still asks for a useful line when the description contains no teachable content', async () => {
    const { t, goalId } = await setup();
    const practiceId = await t.run(
      async (ctx) =>
        await ctx.db.insert('practice', {
          deviceId: 'test-device',
          goalId,
          rungIndex: 0,
          source: 'article',
          url: 'https://example.com',
          status: 'fetching',
          found: '',
          userNote: 'I do not remember',
        }),
    );
    vi.stubEnv('OPENAI_API_KEY', 'test-only-not-a-secret');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            output: [
              {
                content: [
                  {
                    type: 'output_text',
                    text: JSON.stringify({
                      enough: false,
                      ask: 'What is one thing it teaches?',
                      title: '',
                      minutes: 0,
                      howTo: '',
                      why: '',
                    }),
                  },
                ],
              },
            ],
          }),
        ),
      ),
    );
    await t.action(internal.practiceAi.makeStep, { practiceId });
    expect((await t.query(api.practice.forGoal, { goalId }))[0]).toMatchObject({
      status: 'needsNote',
      ask: 'What is one thing it teaches?',
    });
  });
});

describe('photo proof', () => {
  it('logs the note and checks off a missed task atomically without double counting', async () => {
    const { t, goalId, taskId, storageId } = await setup();
    const proofId = await t.mutation(api.practice.addProof, {
      taskId,
      storageId,
      today: '2026-11-15',
    });
    await t.mutation(internal.practice.saveProof, {
      proofId,
      status: 'logged',
      shows: 'Five hand studies',
      note: 'Five studies, one useful step.',
      isAttempt: true,
    });
    await t.mutation(internal.practice.saveProof, {
      proofId,
      status: 'logged',
      note: 'duplicate',
    });
    const state = await t.run(async (ctx) => ({
      task: await ctx.db.get('tasks', taskId),
      goal: await ctx.db.get('goals', goalId),
      checkins: await ctx.db
        .query('checkins')
        .withIndex('by_goal', (q) => q.eq('goalId', goalId))
        .collect(),
    }));
    expect(state.task?.status).toBe('done');
    expect(state.goal).toMatchObject({ slipDays: 0, missStreak: 0 });
    expect(state.checkins).toHaveLength(1);
    expect(state.checkins[0].note).toBe('Five studies, one useful step.');
  });

  it('does not check off an unclear photo, so manual completion stays available', async () => {
    const { t, taskId, storageId } = await setup();
    const proofId = await t.mutation(api.practice.addProof, {
      taskId,
      storageId,
      today: '2026-11-15',
    });
    await t.mutation(internal.practice.saveProof, {
      proofId,
      status: 'unclear',
      shows: 'A coffee mug',
      note: 'You can still check it off yourself.',
    });
    expect(
      await t.run(async (ctx) => (await ctx.db.get('tasks', taskId))?.status),
    ).toBe('missed');
  });

  it('checks off a practice step and selects only earlier comparable attempts', async () => {
    const { t, goalId, storageId } = await setup();
    const practiceId = await t.run(
      async (ctx) =>
        await ctx.db.insert('practice', {
          deviceId: 'test-device',
          goalId,
          rungIndex: 0,
          source: 'youtube',
          url: 'https://youtu.be/lesson',
          status: 'ready',
          title: 'Draw hands',
        }),
    );
    const first = await t.mutation(api.practice.addProof, {
      practiceId,
      storageId,
      today: '2026-11-15',
    });
    await t.mutation(internal.practice.saveProof, {
      proofId: first,
      status: 'logged',
      shows: 'A hand study',
      isAttempt: true,
    });
    expect(
      (await t.query(api.practice.forGoal, { goalId }))[0].doneAt,
    ).toBeTypeOf('number');
    vi.advanceTimersByTime(1);
    const second = await t.mutation(api.practice.addProof, {
      goalId,
      storageId,
      today: '2026-11-15',
    });
    const context = await t.query(internal.practice.proofForAi, {
      proofId: second,
    });
    expect(context?.earlier).toHaveLength(1);
    expect(context?.earlier[0].shows).toBe('A hand study');
  });

  it('rejects arbitrary files and ambiguous targets', async () => {
    const { t, goalId, taskId } = await setup();
    const storageId = await t.run(
      async (ctx) =>
        await ctx.storage.store(new Blob(['<html>'], { type: 'text/html' })),
    );
    await expect(
      t.mutation(api.practice.addProof, {
        goalId,
        storageId,
        today: '2026-11-15',
      }),
    ).rejects.toThrow('Choose a JPG');
    await expect(
      t.mutation(api.practice.addProof, {
        goalId,
        taskId,
        storageId,
        today: '2026-11-15',
      }),
    ).rejects.toThrow('Choose one');
  });

  it('does not resurrect a photo deleted while vision was running', async () => {
    const { t, goalId, storageId } = await setup();
    const proofId = await t.mutation(api.practice.addProof, {
      goalId,
      storageId,
      today: '2026-11-15',
    });
    await t.mutation(api.practice.removeProof, { proofId });
    await t.mutation(internal.practice.saveProof, {
      proofId,
      status: 'logged',
      note: 'Late result',
    });
    expect(await t.query(api.practice.gallery, { goalId })).toEqual([]);
  });

  it('deletes the stored photos and practice steps when a goal is removed', async () => {
    const { t, goalId, storageId } = await setup();
    await t.mutation(api.practice.addProof, {
      goalId,
      storageId,
      today: '2026-11-15',
    });
    await t.mutation(api.practice.addLink, {
      goalId,
      url: 'https://example.com/tutorial',
    });
    await t.mutation(api.goals.remove, { goalId });
    expect(await t.query(api.practice.gallery, { goalId })).toEqual([]);
    expect(await t.query(api.practice.forGoal, { goalId })).toEqual([]);
    expect(
      await t.run(async (ctx) => await ctx.storage.get(storageId)),
    ).toBeNull();
  });

  it('sends actual image inputs with earlier attempts and saves specific feedback', async () => {
    const { t, goalId, storageId } = await setup();
    const first = await t.mutation(api.practice.addProof, {
      goalId,
      storageId,
      today: '2026-11-15',
    });
    await t.mutation(internal.practice.saveProof, {
      proofId: first,
      status: 'logged',
      shows: 'A hand study',
      isAttempt: true,
    });
    vi.advanceTimersByTime(1);
    const second = await t.mutation(api.practice.addProof, {
      goalId,
      storageId,
      today: '2026-11-15',
    });
    vi.stubEnv('OPENAI_API_KEY', 'test-only-not-a-secret');
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    matches: true,
                    shows: 'A second hand study',
                    progress: 'One study',
                    note: 'Another thoughtful attempt.',
                    isAttempt: true,
                    better: 'The fingers have more even spacing.',
                    still: 'The shading is still developing.',
                    next: 'Try one light source.',
                  }),
                },
              ],
            },
          ],
        }),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    await t.action(internal.practiceAi.checkProof, { proofId: second });
    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.store).toBe(false);
    expect(payload.text.format.strict).toBe(true);
    expect(
      payload.input[1].content.filter(
        (p: { type: string }) => p.type === 'input_image',
      ),
    ).toHaveLength(2);
    const gallery = await t.query(api.practice.gallery, { goalId });
    expect(gallery[0]).toMatchObject({
      status: 'logged',
      feedback: { next: 'Try one light source.' },
    });
  });

  it('keeps service errors retryable without exposing upstream response bodies', async () => {
    const { t, goalId, storageId } = await setup();
    const proofId = await t.mutation(api.practice.addProof, {
      goalId,
      storageId,
      today: '2026-11-15',
    });
    vi.stubEnv('OPENAI_API_KEY', 'test-only-not-a-secret');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('sensitive upstream diagnostic', { status: 401 }),
        ),
    );
    await t.action(internal.practiceAi.checkProof, { proofId });
    const [proof] = await t.query(api.practice.gallery, { goalId });
    expect(proof.status).toBe('failed');
    expect(proof.error).not.toContain('sensitive upstream');
    await t.mutation(api.practice.retryProof, { proofId });
    expect((await t.query(api.practice.gallery, { goalId }))[0].status).toBe(
      'checking',
    );
  });
});
