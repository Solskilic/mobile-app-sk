import { v } from 'convex/values';

export const demoProfileFields = {
  fictional: v.literal(true),
  startingPoint: v.string(),
  motivation: v.string(),
  constraints: v.string(),
  structure: v.union(v.literal('routine'), v.literal('flexible')),
  weeklyHours: v.number(),
};

export type DemoProfile = {
  fictional: true;
  startingPoint: string;
  motivation: string;
  constraints: string;
  structure: 'routine' | 'flexible';
  weeklyHours: number;
};

export function profileContext(p: DemoProfile) {
  return `Fictional demo planning context. Starting point: ${p.startingPoint || 'Not sure'}. Reason for the goal: ${p.motivation || 'Not sure'}. Available time: ${p.weeklyHours} hours per week. Constraints: ${p.constraints || 'Not sure'}. Preferred structure: ${p.structure === 'routine' ? 'repeatable practice in consistent time slots' : 'flexible, independent sessions that fit available time'}. Use only these explicit answers; do not infer sensitive traits. Unknown details stay unknown.`;
}

export function validateDemoProfile(profile: DemoProfile) {
  if (
    !Number.isFinite(profile.weeklyHours) ||
    profile.weeklyHours < 1 ||
    profile.weeklyHours > 40
  )
    throw new Error('Choose between 1 and 40 weekly hours');
  for (const text of [
    profile.startingPoint,
    profile.motivation,
    profile.constraints,
  ])
    if (text.length > 600)
      throw new Error('Keep each demo answer under 600 characters');
}
