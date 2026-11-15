/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';
import { ResearchWeb } from './researchWeb';

const modules = import.meta.glob('./**/*.ts');
const day = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 10, 15, 20);
const source = { title: 'Test provider source', url: 'https://learn.example.org/basics', checkedAt: now, provenance: 'Test fixture' };
const resource = { key: 'res:basics', title: 'Design basics', provider: 'Test provider', kind: 'course', forGap: 'Prototyping', url: source.url, price: 'Free', duration: 'Two weeks', free: true, why: 'Practice the basics.', sources: [source] };
const gap = { key: 'gap:prototyping', skill: 'Prototyping', status: 'missing' as const, why: 'No prior design tools.', stopTitle: 'Build a prototype', milestone: 'Show one working prototype.', sources: [source] };

function setup() { return convexTest(schema, modules); }
type Test = ReturnType<typeof setup>;

async function goal(t: Test, deviceId = 'research-test') {
  return await t.run(async (ctx) => {
    const id = await ctx.db.insert('goals', { deviceId, title: 'Switch to UX', text: 'Switch from biology to UX', status: 'active', questions: [], currentRung: 0, slipDays: 0, missStreak: 0, startedAt: now, projectedFinish: now + 6 * 7 * day, estimateWeeks: 6 });
    for (const [index, title] of ['Explore the field', 'Build a portfolio', 'Apply'].entries()) {
      await ctx.db.insert('rungs', { goalId: id, index, title, identity: title, milestone: title, weeks: 2, kind: 'build' });
    }
    return id;
  });
}

async function saved(t: Test, goalId: Id<'goals'>, status: 'done' | 'running' | 'failed' | 'needsBackground' = 'done', startedAt = now - day) {
  return await t.run((ctx) => ctx.db.insert('research', { goalId, deviceId: 'research-test', status, background: 'Biology graduate. Excel, lab research. Four hours weekly.', steps: [], postings: [], gaps: [gap], resources: [resource], addedKeys: [], startedAt }));
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('research storage and route stops', () => {
  it('adds a gap after the current rung, shifts later indices, and uses the time the person chose', async () => {
    const t = setup(); const goalId = await goal(t); const researchId = await saved(t, goalId);
    expect(await t.mutation(api.research.addStop, { researchId, key: gap.key, weeks: 3 })).toBe('added');
    expect(await t.mutation(api.research.addStop, { researchId, key: gap.key, weeks: 3 })).toBe('already');
    const result = await t.query(api.goals.get, { goalId });
    expect(result?.rungs.map((r) => r.title)).toEqual(['Explore the field', 'Build a prototype', 'Build a portfolio', 'Apply']);
    expect(result?.estimateWeeks).toBe(9);
    expect(result?.projectedFinish).toBe(now + 9 * 7 * day);
  });

  it('rejects invalid time, closed goals, and incomplete research', async () => {
    const t = setup(); const goalId = await goal(t); const researchId = await saved(t, goalId);
    await expect(t.mutation(api.research.addStop, { researchId, key: gap.key, weeks: 0 })).rejects.toThrow('whole number');
    await t.run((ctx) => ctx.db.patch('goals', goalId, { status: 'done' }));
    expect(await t.mutation(api.research.addStop, { researchId, key: gap.key, weeks: 1 })).toBe('closed');
    const pending = await saved(t, goalId, 'running');
    await expect(t.mutation(api.research.addStop, { researchId: pending, key: gap.key, weeks: 1 })).rejects.toThrow('finish');
  });

  it('returns the saved result without another action when the same inputs are fresh', async () => {
    const t = setup(); const goalId = await goal(t); const researchId = await saved(t, goalId, 'done', now - 30_000);
    expect(await t.mutation(api.research.start, { goalId })).toBe(researchId);
    await expect(t.mutation(api.research.start, { goalId, refresh: true })).rejects.toThrow('few minutes');
    expect(await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect())).toHaveLength(0);
  });

  it('preserves earlier successful sources when a refresh fails', async () => {
    const t = setup(); const goalId = await goal(t); const original = await saved(t, goalId);
    await saved(t, goalId, 'failed', now);
    const result = await t.query(api.research.get, { goalId });
    expect(result?.run?.status).toBe('failed');
    expect(result?.saved?._id).toBe(original);
  });

  it('pins the last successful result through cleanup after repeated failed refreshes', async () => {
    const t = setup(); const goalId = await goal(t); const original = await saved(t, goalId, 'done', now - 4 * day);
    await saved(t, goalId, 'failed', now - 3 * day);
    await saved(t, goalId, 'failed', now - 2 * day);
    await saved(t, goalId, 'failed', now - day - 60_000);
    const researchId = await t.mutation(api.research.start, { goalId });
    await t.mutation(internal.research.patch, { researchId: researchId!, status: 'failed' });
    const result = await t.query(api.research.get, { goalId });
    expect(result?.saved?._id).toBe(original);
    expect(result?.saved?.resources).toEqual([resource]);
    expect(await t.run((ctx) => ctx.db.get('research', original))).not.toBeNull();
  });

  it('limits fresh searches per device across goals', async () => {
    const t = setup(); const goalId = await goal(t);
    for (let i = 0; i < 8; i++) await saved(t, goalId, 'failed', now - 60_000 * (i + 11));
    const next = await goal(t);
    await expect(t.mutation(api.research.start, { goalId: next })).rejects.toThrow('enough fresh research');
  });

  it('prevents adding the same resource through an older cached run', async () => {
    const t = setup(); const goalId = await goal(t); const old = await saved(t, goalId);
    const fresh = await saved(t, goalId, 'done', now);
    expect(await t.mutation(api.research.addStop, { researchId: old, key: resource.key, weeks: 1 })).toBe('added');
    expect(await t.mutation(api.research.addStop, { researchId: fresh, key: resource.key, weeks: 1 })).toBe('already');
    expect((await t.query(api.research.get, { goalId }))?.run?.addedKeys).toContain(resource.key);
  });

  it('expires abandoned actions but never overwrites a finished result', async () => {
    const t = setup(); const goalId = await goal(t); const running = await saved(t, goalId, 'running', now);
    await t.mutation(internal.research.expire, { researchId: running });
    expect((await t.query(api.research.get, { goalId }))?.run?.status).toBe('failed');
    const done = await saved(t, goalId, 'done', now + 1);
    await t.mutation(internal.research.expire, { researchId: done });
    expect((await t.query(api.research.get, { goalId }))?.run?.status).toBe('done');
  });

  it('removes cached research with a deleted goal', async () => {
    const t = setup(); const goalId = await goal(t); const researchId = await saved(t, goalId);
    await t.mutation(api.goals.remove, { goalId });
    expect(await t.query(api.research.get, { goalId })).toBeNull();
    expect(await t.run((ctx) => ctx.db.get('research', researchId))).toBeNull();
  });
});

function output(name: string, value: unknown, urls: string[] = []) {
  return new Response(JSON.stringify({ id: `response-${name}`, output: [
    ...(urls.length ? [{ type: 'web_search_call', action: { query: name, sources: urls.map((url) => ({ url, title: `Fixture: ${url}` })) } }] : []),
    { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] },
  ] }), { status: 200 });
}

describe('research agent contract with mocked OpenAI', () => {
  it.each([undefined, 'Four hours weekly, free options'])('asks for complete background before searching career requirements: %s', async (background) => {
    vi.stubEnv('OPENAI_API_KEY', 'test-only-not-a-real-key');
    const fetch = vi.fn().mockResolvedValue(output('classify', { kind: 'career', academic: false, target: 'UX designer', knowsBackground: false, backgroundSummary: '', question: 'What have you studied and worked on?', location: '' }));
    vi.stubGlobal('fetch', fetch);
    const t = setup(); const goalId = await goal(t);
    const researchId = await t.mutation(api.research.start, { goalId, background });
    await t.action(internal.researchAgent.run, { researchId: researchId! });
    const result = await t.query(api.research.get, { goalId });
    expect(result?.run?.status).toBe('needsBackground');
    expect(result?.run?.question).toContain('studied');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('stores cited skill gaps and checked resources, dropping unsupported URLs', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-only-not-a-real-key');
    vi.spyOn(ResearchWeb.prototype, 'check').mockImplementation(async function (this: ResearchWeb, url) {
      if (!this.sources.has(url)) return null;
      this.checked.set(url, { checkedAt: now, text: '' });
      return now;
    });
    const jobUrl = 'https://careers.example.org/ux-designer';
    const postings = [{ title: 'Junior UX designer', company: 'Fixture company', location: 'Remote', postedDate: '2026-11-10', url: jobUrl, requirements: ['Prototyping', 'Research'] }];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      switch (body.text.format.name) {
        case 'classify': return output('classify', { kind: 'career', academic: false, target: 'UX designer', knowsBackground: true, backgroundSummary: 'Biology and lab research', question: '', location: '' });
        case 'occupation_evidence': return output('occupation', { evidence: [] });
        case 'job_postings': return output('jobs', { postings }, [jobUrl]);
        case 'skill_gaps': return output('gaps', { gaps: [gap, ...['C', 'C++', 'C#'].map((skill) => ({ ...gap, skill }))].map((g) => ({ ...g, postings: [0] })) });
        case 'resources': return output('resources', { summary: 'Build one prototype using a free course.', resources: [resource, { ...resource, title: 'Invented course', url: 'https://learn.example.org/not-in-search' }] }, [source.url]);
        default: throw new Error('Unexpected model request');
      }
    }));
    const t = setup(); const goalId = await goal(t); const researchId = await saved(t, goalId, 'running', now);
    await t.action(internal.researchAgent.run, { researchId });
    const result = (await t.query(api.research.get, { goalId }))!.run!;
    expect(result.status).toBe('done');
    expect(result.gaps[0].sources[0].url).toBe(jobUrl);
    expect(result.gaps.map((g) => g.skill)).toEqual(['Prototyping', 'C', 'C++', 'C#']);
    expect(new Set(result.gaps.map((g) => g.key)).size).toBe(4);
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].sources[0].checkedAt).toBe(now);
    expect(result.steps.some((s) => s.text.includes('Dropped 1 link'))).toBe(true);
  });

  it('records a clear failure rather than inventing postings', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-only-not-a-real-key');
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const name = JSON.parse(String(init.body)).text.format.name;
      return output(name, name === 'classify'
        ? { kind: 'career', academic: false, target: 'UX designer', knowsBackground: true, backgroundSummary: 'Biology graduate', question: '', location: '' }
        : name === 'occupation_evidence' ? { evidence: [] } : { postings: [] });
    }));
    const t = setup(); const goalId = await goal(t); const researchId = await saved(t, goalId, 'running', now);
    await t.action(internal.researchAgent.run, { researchId });
    const result = (await t.query(api.research.get, { goalId }))!.run!;
    expect(result.status).toBe('failed');
    expect(result.error).toContain('live job postings');
    expect(result.postings).toEqual([]);
  });

  it('executes read_page tool calls and sends their outputs back to OpenAI', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-only-not-a-real-key');
    vi.spyOn(ResearchWeb.prototype, 'read').mockResolvedValue('Untrusted course page: free beginner class.');
    vi.spyOn(ResearchWeb.prototype, 'check').mockImplementation(async function (this: ResearchWeb, url) {
      if (!this.sources.has(url)) return null;
      this.checked.set(url, { checkedAt: now, text: '' }); return now;
    });
    const calls: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)); calls.push(body);
      if (body.text.format.name === 'classify') return output('classify', { kind: 'hobby', academic: false, target: 'pottery', knowsBackground: false, backgroundSummary: '', question: '', location: '' });
      if (!body.previous_response_id) return new Response(JSON.stringify({ id: 'tool-round', output: [
        { type: 'web_search_call', action: { sources: [{ url: source.url, title: 'A fixture class' }] } },
        { type: 'function_call', call_id: 'read-1', name: 'read_page', arguments: JSON.stringify({ url: source.url }) },
      ] }));
      expect(body.previous_response_id).toBe('tool-round');
      expect(body.input[0]).toMatchObject({ type: 'function_call_output', call_id: 'read-1' });
      expect(body.input[0].output).toContain('Untrusted course page');
      return output('hobby', { summary: 'Try the beginner class.', resources: [resource] });
    }));
    const t = setup(); const goalId = await goal(t); const researchId = await saved(t, goalId, 'running', now);
    await t.action(internal.researchAgent.run, { researchId });
    expect((await t.query(api.research.get, { goalId }))?.run?.status).toBe('done');
    expect(calls).toHaveLength(3);
  });

  it('uses a function search tool if the main model rejects hosted web search', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-only-not-a-real-key');
    let stage = 0;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.text?.format.name === 'classify') return output('classify', { kind: 'hobby', academic: false, target: 'pottery', knowsBackground: false, backgroundSummary: '', question: '', location: '' });
      stage++;
      if (stage === 1) return new Response('web_search is not supported for this model', { status: 400 });
      if (stage === 2) {
        expect(body.tools[0].name).toBe('search_web');
        return new Response(JSON.stringify({ id: 'fallback-round', output: [{ type: 'function_call', call_id: 'search-1', name: 'search_web', arguments: JSON.stringify({ query: 'beginner pottery classes' }) }] }));
      }
      if (stage === 3) {
        expect(body.model).toBe('gpt-6.1-sol');
        expect(body.tools[0].type).toBe('web_search');
        return new Response(JSON.stringify({ id: 'search-result', output: [{ type: 'message', content: [{ type: 'output_text', text: 'No accessible classes found.' }] }] }));
      }
      return output('empty-hobby', { summary: 'No accessible classes found.', resources: [] });
    }));
    const t = setup(); const goalId = await goal(t); const researchId = await saved(t, goalId, 'running', now);
    await t.action(internal.researchAgent.run, { researchId });
    const result = (await t.query(api.research.get, { goalId }))!.run!;
    expect(result.status).toBe('done');
    expect(result.resources).toEqual([]);
    expect(result.steps.some((s) => s.text.includes('search-capable model'))).toBe(true);
  });
});
