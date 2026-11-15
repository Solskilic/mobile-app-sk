import { v } from 'convex/values';

export const answersV = v.object({ dilemma: v.string(), energy: v.string(), drain: v.string(), constraints: v.string(), context: v.string() });
export const sourceV = v.object({ title: v.string(), url: v.string(), quote: v.string(), checkedAt: v.number(), geography: v.string() });
export const pathV = v.object({ title: v.string(), upside: v.string(), cost: v.string(), unknown: v.string(), hypothesis: v.string(), kind: v.union(v.literal('design'), v.literal('explain'), v.literal('analyse'), v.literal('people'), v.literal('build')), source: sourceV });
export const outcomeV = v.object({ path: v.number(), title: v.string(), artifact: v.string(), feeling: v.union(v.literal('energizing'), v.literal('mixed'), v.literal('draining')), surprise: v.string(), at: v.number(), revision: v.number() });
export const labFields = {
  key: v.string(), answers: answersV, step: v.number(), revision: v.number(),
  status: v.union(v.literal('draft'), v.literal('researching'), v.literal('ready'), v.literal('failed')),
  paths: v.array(pathV), selected: v.optional(v.number()), artifact: v.string(),
  outcomes: v.array(outcomeV), startedAt: v.number(), researchedAt: v.optional(v.number()),
  error: v.optional(v.string()), attempts: v.number(),
};
export type Answers = { dilemma: string; energy: string; drain: string; constraints: string; context: string };
export type CareerPath = { title: string; upside: string; cost: string; unknown: string; hypothesis: string; kind: 'design' | 'explain' | 'analyse' | 'people' | 'build'; source: { title: string; url: string; quote: string; checkedAt: number; geography: string } };
export type Outcome = { path: number; title: string; artifact: string; feeling: 'energizing' | 'mixed' | 'draining'; surprise: string; at: number; revision: number };
