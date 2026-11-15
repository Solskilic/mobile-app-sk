import { v } from "convex/values";

export const researchCitation = v.object({
  title: v.string(),
  url: v.string(),
  checkedAt: v.number(),
  provenance: v.string(),
});

export const researchPosting = v.object({
  title: v.string(),
  company: v.string(),
  location: v.string(),
  url: v.string(),
  postedDate: v.string(),
  requirements: v.array(v.string()),
  source: researchCitation,
});

export const researchGap = v.object({
  key: v.string(),
  skill: v.string(),
  status: v.union(v.literal("have"), v.literal("partial"), v.literal("missing")),
  why: v.string(),
  stopTitle: v.string(),
  milestone: v.string(),
  sources: v.array(researchCitation),
});

export const researchResource = v.object({
  key: v.string(),
  title: v.string(),
  provider: v.string(),
  kind: v.string(),
  forGap: v.string(),
  url: v.string(),
  price: v.string(),
  duration: v.string(),
  free: v.boolean(),
  why: v.string(),
  sources: v.array(researchCitation),
});

export const occupationEvidence = v.object({
  title: v.string(),
  typicalPath: v.string(),
  taxonomySkills: v.array(v.string()),
  sourceDate: v.string(),
  source: researchCitation,
});

export const researchStatus = v.union(
  v.literal("running"), v.literal("needsBackground"), v.literal("done"), v.literal("failed"),
);

export const researchFields = {
  goalId: v.id("goals"),
  deviceId: v.optional(v.string()),
  status: researchStatus,
  kind: v.optional(v.union(v.literal("career"), v.literal("hobby"))),
  target: v.optional(v.string()),
  background: v.optional(v.string()),
  location: v.optional(v.string()),
  question: v.optional(v.string()),
  summary: v.optional(v.string()),
  occupation: v.optional(v.array(occupationEvidence)),
  notes: v.optional(v.array(v.string())),
  steps: v.array(v.object({ text: v.string(), at: v.number() })),
  postings: v.array(researchPosting),
  gaps: v.array(researchGap),
  resources: v.array(researchResource),
  addedKeys: v.array(v.string()),
  error: v.optional(v.string()),
  startedAt: v.number(),
  finishedAt: v.optional(v.number()),
};

export const researchDoc = v.object({
  ...researchFields,
  _id: v.id("research"),
  _creationTime: v.number(),
});
