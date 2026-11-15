import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalMutation, mutation, query } from './_generated/server';
import schema from './schema';
import { answersV, pathV } from './careerTypes';

const KEY = 'career-lab-single-user';
const idV = v.id('careerLabs');
const empty = { dilemma: '', energy: '', drain: '', constraints: '', context: '' };

export const get = query({ args: {}, returns: v.union(schema.doc('careerLabs'), v.null()), handler: async (ctx) => ctx.db.query('careerLabs').withIndex('by_key', q => q.eq('key', KEY)).unique() });
export const ensure = mutation({ args: {}, returns: idV, handler: async (ctx) => {
  const old = await ctx.db.query('careerLabs').withIndex('by_key', q => q.eq('key', KEY)).unique();
  return old?._id ?? await ctx.db.insert('careerLabs', { key: KEY, answers: empty, step: 0, revision: 0, status: 'draft', paths: [], artifact: '', outcomes: [], startedAt: 0, attempts: 0 });
} });
export const saveAnswers = mutation({ args: { answers: answersV, step: v.number() }, returns: v.null(), handler: async (ctx, { answers, step }) => {
  if (!Number.isInteger(step) || step < 0 || step > 4 || Object.values(answers).some(s => s.length > 1600)) throw new Error('Please keep each answer under 1,600 characters.');
  const lab = await ctx.db.query('careerLabs').withIndex('by_key', q => q.eq('key', KEY)).unique();
  if (!lab) throw new Error('Open the lab first.');
  const changed = JSON.stringify(lab.answers) !== JSON.stringify(answers);
  await ctx.db.patch('careerLabs', lab._id, { answers, step, ...(changed ? { revision: lab.revision + 1, status: 'draft' as const, paths: [], selected: undefined, artifact: '', error: undefined } : {}) });
  return null;
} });
export const research = mutation({ args: { refresh: v.optional(v.boolean()) }, returns: v.null(), handler: async (ctx, { refresh }) => {
  const lab = await ctx.db.query('careerLabs').withIndex('by_key', q => q.eq('key', KEY)).unique();
  if (!lab || ['dilemma', 'energy', 'drain', 'constraints'].some(k => !lab.answers[k as keyof typeof lab.answers].trim())) throw new Error('Answer the four short questions first.');
  const now = Date.now();
  if (lab.status === 'researching' && now - lab.startedAt < 180000) return null;
  if (!refresh && lab.paths.length === 2 && lab.researchedAt && now - lab.researchedAt < 86400000) return null;
  if (now - lab.startedAt < 60000) throw new Error('Please wait one minute before another search.');
  if (lab.attempts >= 12) throw new Error('This single-user demo has reached its 12-search budget.');
  await ctx.db.patch('careerLabs', lab._id, { status: 'researching', startedAt: now, attempts: lab.attempts + 1, error: undefined });
  await ctx.scheduler.runAfter(0, internal.careerResearch.run, { labId: lab._id, revision: lab.revision, startedAt: now, answers: lab.answers });
  return null;
} });
export const finish = internalMutation({ args: { labId: idV, revision: v.number(), startedAt: v.number(), paths: v.optional(v.array(pathV)), error: v.optional(v.string()) }, returns: v.null(), handler: async (ctx, args) => {
  const lab = await ctx.db.get('careerLabs', args.labId);
  if (!lab || lab.revision !== args.revision || lab.startedAt !== args.startedAt) return null;
  if (args.paths && args.paths.length !== 2) throw new Error('Exactly two paths are required.');
  await ctx.db.patch('careerLabs', lab._id, args.paths ? { paths: args.paths, status: 'ready', researchedAt: Date.now(), error: undefined } : { status: 'failed', error: args.error ?? 'Sources could not be verified. Your answers are safe.' });
  return null;
} });
export const choose = mutation({ args: { path: v.number(), revision: v.number() }, returns: v.null(), handler: async (ctx, { path, revision }) => {
  const lab = await ctx.db.query('careerLabs').withIndex('by_key', q => q.eq('key', KEY)).unique();
  if (!lab || lab.revision !== revision || ![0, 1].includes(path) || lab.paths.length !== 2) throw new Error('Reload the comparison before choosing.');
  await ctx.db.patch('careerLabs', lab._id, { selected: path, ...(lab.selected !== path ? { artifact: '' } : {}) });
  return null;
} });
export const saveWork = mutation({ args: { artifact: v.string(), path: v.number(), revision: v.number() }, returns: v.null(), handler: async (ctx, args) => {
  const lab = await ctx.db.query('careerLabs').withIndex('by_key', q => q.eq('key', KEY)).unique();
  if (!lab || lab.revision !== args.revision || lab.selected !== args.path) throw new Error('Your choice changed. Reopen the work sample.');
  if (args.artifact.length > 8000) throw new Error('Keep the work sample under 8,000 characters.');
  await ctx.db.patch('careerLabs', lab._id, { artifact: args.artifact }); return null;
} });
export const reflect = mutation({ args: { path: v.number(), revision: v.number(), feeling: v.union(v.literal('energizing'), v.literal('mixed'), v.literal('draining')), surprise: v.string() }, returns: v.null(), handler: async (ctx, args) => {
  const lab = await ctx.db.query('careerLabs').withIndex('by_key', q => q.eq('key', KEY)).unique();
  if (!lab || lab.revision !== args.revision || lab.selected !== args.path || !lab.paths[args.path]) throw new Error('Your choice changed. Reopen the work sample.');
  if (lab.artifact.trim().length < 30 || args.surprise.trim().length < 3 || args.surprise.length > 1600) throw new Error('Add your work and one short reflection first.');
  const outcome = { ...args, title: lab.paths[args.path].title, artifact: lab.artifact, at: Date.now() };
  await ctx.db.patch('careerLabs', lab._id, { outcomes: [...lab.outcomes, outcome].slice(-20) }); return null;
} });
