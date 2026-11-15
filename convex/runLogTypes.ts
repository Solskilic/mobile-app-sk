import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const MAX_MANUAL_RUNS = 100;
export const MAX_SAMPLE_RUNS = 3;
export const runProvenance = v.union(v.literal('manual'), v.literal('sample'));
export const runEvidenceValidator = v.object({
  provenance: v.literal('manual'),
  asOfDate: v.string(),
  latestRunDate: v.union(v.string(), v.null()),
  count: v.number(),
  totalDistance: v.number(),
  totalMovingTime: v.number(),
});

export const runLogTables = {
  runLogs: defineTable({
    goalId: v.id('goals'),
    provenance: runProvenance,
    date: v.string(),
    distance: v.number(),
    movingTime: v.number(),
    addedAt: v.number(),
  }).index('by_goal_and_provenance_and_date', ['goalId', 'provenance', 'date']),
};

