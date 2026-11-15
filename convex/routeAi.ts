import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { arr, askJson, num, obj, str } from "./openai";
import { DEDICATION_LABEL, HOURS_PER_WEEK, acyclic, cosine, type Dedication } from "./routeEngine";

const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL ?? "text-embedding-3-small";
const MERGE_AT = 0.8;
const CANDIDATE_AT = 0.4;
const BRIDGE_FIT_AT = 0.3;
const MAX_GOALS = 6;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

async function embed(texts: string[]): Promise<number[][]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set on the Convex deployment");
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { data: { index: number; embedding: number[] }[] };
  const vectors = body.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  if (vectors.length !== texts.length || !vectors[0]?.length ||
      vectors.some((vec) => vec.length !== vectors[0].length || vec.some((n) => !Number.isFinite(n))))
    throw new Error("OpenAI returned incomplete embeddings");
  return vectors;
}

type Split = {
  goals: { title: string; summary: string; weeklyHours: number; horizon?: { kind: "flexible" | "byDate" | "recurring" | "exploration"; date: string; detail: string } }[];
  prerequisites: { goal: number; after: number; why: string }[];
};
type Step = {
  title: string;
  why: string;
  identity: string;
  milestone: string;
  effortHours: number;
  minWeeks: number;
  kind: "explore" | "build";
  dependsOn: number[];
};
type Bridge = {
  pair: number;
  fits: boolean;
  title: string;
  why: string;
  identity: string;
  milestone: string;
  effortHours: number;
  minWeeks: number;
  afterStepA: number;
  afterStepB: number;
  reason: string;
};

type StopDraft = {
  key: string;
  goalKeys: string[];
  title: string;
  why: string;
  identity: string;
  milestone: string;
  effortHours: number;
  minWeeks: number;
  kind: "explore" | "build";
  dependsOn: string[];
  origin: "goal" | "merged" | "bridge";
};

const stepSchema = obj({
  title: str("The stop as a concrete outcome, max 7 words, e.g. 'Run a 10K without stopping'"),
  why: str("One plain sentence: why this stop comes here on the route"),
  identity: str("Neutral completion label, e.g. Completed: 10K run"),
  milestone: str("How they know they've reached it, one line"),
  effortHours: num("Total hours of practice this stop needs"),
  minWeeks: num("Minimum calendar weeks even with unlimited time (body adaptation, applications, etc.)"),
  kind: { type: "string", enum: ["explore", "build"] },
  dependsOn: arr(num(), "Step numbers (1-based, earlier steps only) that must be done first. Empty if none."),
});

export const build = internalAction({
  args: { routeId: v.id("routes") },
  returns: v.null(),
  handler: async (ctx, { routeId }) => {
    const route = await ctx.runQuery(internal.route.forAi, { routeId });
    if (!route || route.status !== "building") return null;
    const dedication = route.dedication as Dedication;
    const hours = route.weeklyHours ?? HOURS_PER_WEEK[dedication];
    const timeline = route.timelineWeeks ? `Optional overall check-in after ${route.timelineWeeks} weeks. This is not a deadline for each goal.` : "No global deadline.";
    const stage = (text: string) => ctx.runMutation(internal.route.setStage, { routeId, stage: text });
    try {
      await stage("Reading your list");
      const split = await askJson<Split>(
        "split_goals",
        obj({
          goals: arr(
            obj({
              title: str("Short goal title, max 5 words, in their words"),
              summary: str("One sentence: what success looks like for them"),
              weeklyHours: num("Hours per week this goal needs for steady progress, given their dedication"),
              horizon: obj({
                kind: { type: "string", enum: ["flexible", "byDate", "recurring", "exploration"] },
                date: str("YYYY-MM-DD only if the person supplied an explicit by-date deadline; otherwise empty"),
                detail: str("Their timing preference in plain words; do not invent a deadline"),
              }),
            }),
            `1 to ${MAX_GOALS} goals, in the order they wrote them`,
          ),
          prerequisites: arr(
            obj({
              goal: num("Goal number (1-based) that must wait"),
              after: num("Goal number (1-based) that must be finished first"),
              why: str("One plain sentence"),
            }),
            "Only real hard prerequisites between goals (e.g. learn Spanish before moving to Madrid). Usually empty.",
          ),
        }),
        `A person wrote everything they want to change in their life:
"""${route.input}"""
Dedication: ${DEDICATION_LABEL[dedication]} (about ${hours} hours a week in total across everything). ${timeline}
Today: ${route.startDate}. Per-goal timing supplied separately: ${JSON.stringify(route.goalHorizons ?? [])}.
Explicit fictional demo planning context: ${route.profileContext ?? 'No additional context supplied'}. Use stated experience, motivation, constraints and preferred structure to shape the route; do not infer missing traits.
Career context supplied by the person: ${JSON.stringify(route.careerContext ?? null)}. Unknown or 'not sure' means UNKNOWN, not permission to invent a background or assume eligibility. For investment banking distinguish analyst recruiting from associate recruiting; never assume an MBA or particular credential guarantees entry. Career stops are provisional hypotheses until current employer sources are checked. Preserve role, seniority and geography in the summary. Never promise a hiring date.
Keep capacity separate from each goal's horizon. Flexible goals have no deadline; recurring goals continue; exploration is an open inquiry. Preserve explicit per-goal dates, never invent dates for untimed goals. A date must never compress effort or body/calendar adaptation.

Split this into distinct goals (merge items that are clearly the same goal, keep vague ones vague but concrete enough to act on). Group the list into at most ${MAX_GOALS} goal families without discarding any aspiration; include every original idea in a summary. Preserve their stated priority order.`,
      );
      const goals = split.goals.slice(0, MAX_GOALS).map((g, i) => ({
        key: `g${i + 1}`,
        title: g.title,
        summary: g.summary,
        weeklyHours: Math.min(hours, Math.max(1, Math.round(g.weeklyHours * 2) / 2)),
        horizon: g.horizon ? {
          kind: g.horizon.kind === "byDate" && !/^\d{4}-\d{2}-\d{2}$/.test(g.horizon.date) ? "flexible" as const : g.horizon.kind,
          ...(g.horizon.kind === "byDate" && /^\d{4}-\d{2}-\d{2}$/.test(g.horizon.date) ? { date: g.horizon.date } : {}),
          ...(g.horizon.detail ? { detail: g.horizon.detail.slice(0, 500) } : {}),
        } : { kind: "flexible" as const },
        after: [] as string[],
        afterWhy: undefined as string | undefined,
      }));
      if (goals.length === 0) throw new Error("Couldn't find a goal in that list");
      for (const p of split.prerequisites) {
        const goal = goals[p.goal - 1];
        const after = goals[p.after - 1];
        if (goal && after && goal !== after) {
          goal.after.push(after.key);
          goal.afterWhy = p.why;
        }
      }
      const goalCheck = acyclic(goals.map((g) => ({ key: g.key, deps: g.after })));
      for (const g of goals) g.after = goalCheck.deps.get(g.key) ?? [];

      await stage(`Mapping stops for ${goals.length} ${goals.length === 1 ? "goal" : "goals"}`);
      const steps = await Promise.all(
        goals.map((g) =>
          askJson<{ steps: Step[] }>(
            "decompose_goal",
            obj({ steps: arr(stepSchema, "3 to 6 stops, from first step to finish line") }),
            `Goal: ${g.title}. ${g.summary}
Fictional demo context: ${route.profileContext ?? 'No additional context supplied'}. Preserve stated experience and constraints rather than restarting from zero or inventing experience. Match the preferred practice structure.
They can give this goal about ${g.weeklyHours} hours a week. Its horizon: ${JSON.stringify(g.horizon)}. Do not shorten effort to fit a deadline. Recurring/exploration goals get a bounded first chapter, not a claim that the activity is permanently finished.
Break it into 3-6 milestone stops along a route, small to big. Fuzzy or career goals start with an "explore" stop. Use dependsOn for real prerequisites only; stops that can happen in any order should not depend on each other.`,
          ),
        ),
      );
      let stops: StopDraft[] = goals.flatMap((g, gi) => {
        const list = steps[gi].steps.slice(0, 6);
        return list.map((s, si) => ({
          key: `${g.key}.s${si + 1}`,
          goalKeys: [g.key],
          title: s.title,
          why: s.why,
          identity: s.identity,
          milestone: s.milestone,
          effortHours: Math.min(2000, Math.max(1, Math.round(s.effortHours))),
          minWeeks: Math.min(104, Math.max(1, Math.round(s.minWeeks))),
          kind: s.kind,
          dependsOn: s.dependsOn.filter((d) => d >= 1 && d <= si).map((d) => `${g.key}.s${d}`),
          origin: "goal" as const,
        }));
      });

      await stage("Looking for overlaps between goals");
      const vectors = await embed([
        ...goals.map((g) => `${g.title}. ${g.summary}`),
        ...stops.map((s) => `${s.title}. ${s.why}`),
      ]);
      const goalVec = new Map(goals.map((g, i) => [g.key, vectors[i]]));
      const stopVec = new Map(stops.map((s, i) => [s.key, vectors[goals.length + i]]));

      const merges: { stopKey: string; dropped: string; goalKeys: string[] }[] = [];
      const pairs: { a: StopDraft; b: StopDraft; sim: number }[] = [];
      for (let i = 0; i < stops.length; i++) {
        for (let j = i + 1; j < stops.length; j++) {
          if (stops[i].goalKeys[0] === stops[j].goalKeys[0]) continue;
          pairs.push({ a: stops[i], b: stops[j], sim: cosine(stopVec.get(stops[i].key)!, stopVec.get(stops[j].key)!) });
        }
      }
      pairs.sort((x, y) => y.sim - x.sim);
      const mergeCandidates = pairs.filter((p) => p.sim >= MERGE_AT).slice(0, 12);
      const confirmed = new Set<number>();
      if (mergeCandidates.length) {
        const verdict = await askJson<{ pairs: { pair: number; sameOutcome: boolean }[] }>(
          "confirm_duplicate_stops",
          obj({ pairs: arr(obj({
            pair: num("Pair number"),
            sameOutcome: { type: "boolean", description: "One completed milestone genuinely fulfills both outcomes" },
          })) }),
          `Check these embedding-matched milestone pairs. Set sameOutcome=true only when completing one milestone unambiguously fulfills BOTH. Never merge different scales (5K and 10K), exploration and execution, or similar-sounding activities in unrelated contexts.
${mergeCandidates.map((p, i) => `Pair ${i + 1}: "${p.a.title}" (${p.a.milestone}) vs "${p.b.title}" (${p.b.milestone})`).join("\n")}`,
        );
        for (const p of verdict.pairs) if (p.sameOutcome && Number.isInteger(p.pair) && p.pair >= 1 && p.pair <= mergeCandidates.length) confirmed.add(p.pair);
      }
      const gone = new Map<string, string>();
      for (const [index, p] of mergeCandidates.entries()) {
        if (!confirmed.has(index + 1)) continue;
        if (gone.has(p.a.key) || gone.has(p.b.key)) continue;
        gone.set(p.b.key, p.a.key);
        p.a.goalKeys = [...new Set([...p.a.goalKeys, ...p.b.goalKeys])];
        p.a.effortHours = Math.max(p.a.effortHours, p.b.effortHours);
        p.a.minWeeks = Math.max(p.a.minWeeks, p.b.minWeeks);
        p.a.dependsOn = [...new Set([...p.a.dependsOn, ...p.b.dependsOn])];
        p.a.origin = "merged";
        merges.push({ stopKey: p.a.key, dropped: p.b.title, goalKeys: p.a.goalKeys });
      }
      stops = stops.filter((s) => !gone.has(s.key));
      const root = (key: string) => {
        while (gone.has(key)) key = gone.get(key)!;
        return key;
      };
      for (const s of stops) {
        s.dependsOn = [...new Set(s.dependsOn.map(root))].filter((d) => d !== s.key);
      }
      for (const m of merges) {
        m.stopKey = root(m.stopKey);
        m.goalKeys = stops.find((s) => s.key === m.stopKey)!.goalKeys;
      }

      const goalPairs: { a: (typeof goals)[number]; b: (typeof goals)[number]; sim: number }[] = [];
      for (let i = 0; i < goals.length; i++) {
        for (let j = i + 1; j < goals.length; j++) {
          const a = goals[i];
          const b = goals[j];
          const already = stops.some((s) => s.goalKeys.includes(a.key) && s.goalKeys.includes(b.key));
          if (already) continue;
          const cross = pairs
            .filter((p) => !gone.has(p.a.key) && !gone.has(p.b.key))
            .filter(
              (p) =>
                (p.a.goalKeys.includes(a.key) && p.b.goalKeys.includes(b.key)) ||
                (p.a.goalKeys.includes(b.key) && p.b.goalKeys.includes(a.key)),
            )
            .reduce((m, p) => Math.max(m, p.sim), 0);
          const sim = Math.max(cross, cosine(goalVec.get(a.key)!, goalVec.get(b.key)!));
          goalPairs.push({ a, b, sim });
        }
      }
      goalPairs.sort((x, y) => y.sim - x.sim);
      const candidates = goalPairs.filter((p) => p.sim >= CANDIDATE_AT).slice(0, 4);
      if (goals.length >= 2 && candidates.length === 0 && goalPairs[0]) candidates.push(goalPairs[0]);

      const synergies: { stopKey: string; goalKeys: string[]; reason: string }[] = [...new Map(merges.map((m) => [m.stopKey, m])).values()].map((m) => ({
        stopKey: m.stopKey,
        goalKeys: m.goalKeys,
        reason: "",
      }));
      if (candidates.length > 0) {
        await stage("Finding stops that serve two goals at once");
        const listSteps = (key: string) =>
          stops
            .filter((s) => s.goalKeys.includes(key))
            .map((s, i) => `    ${i + 1}. ${s.title}`)
            .join("\n");
        const out = await askJson<{ bridges: Bridge[] }>(
          "bridges",
          obj({
            bridges: arr(
              obj({
                pair: num("Pair number"),
                fits: { type: "boolean", description: "true only if one real activity clearly moves BOTH goals" },
                title: str("The shared stop, max 7 words, e.g. 'Join a beginner run club'"),
                why: str("One plain sentence: how this one stop serves both goals"),
                identity: str("Neutral factual completion label"),
                milestone: str("How they know they've reached it"),
                effortHours: num("Total hours"),
                minWeeks: num("Minimum weeks"),
                afterStepA: num("Step number in goal A it should come after, 0 for none"),
                afterStepB: num("Step number in goal B it should come after, 0 for none"),
                reason: str("Factual shared-activity label, max 8 words, no slogan"),
              }),
              "One entry per pair",
            ),
          }),
          `These goal pairs might overlap. For each pair, propose ONE concrete shared stop that genuinely advances both goals at the same time (example: running + making friends in a new city -> join a beginner run club). If no honest overlap exists, set fits=false.
${candidates
  .map(
    (c, i) => `Pair ${i + 1}:
  Goal A: ${c.a.title}. ${c.a.summary}
${listSteps(c.a.key)}
  Goal B: ${c.b.title}. ${c.b.summary}
${listSteps(c.b.key)}`,
  )
  .join("\n")}`,
        );
        const proposals = out.bridges.filter((b) => b.fits && candidates[b.pair - 1]);
        const bridgeVecs = proposals.length ? await embed(proposals.map((b) => `${b.title}. ${b.why}`)) : [];
        proposals.forEach((b, i) => {
          const c = candidates[b.pair - 1];
          const vec = bridgeVecs[i];
          const fitA = cosine(vec, goalVec.get(c.a.key)!);
          const fitB = cosine(vec, goalVec.get(c.b.key)!);
          if (Math.min(fitA, fitB) < BRIDGE_FIT_AT) return;
          const mineA = stops.filter((s) => s.goalKeys.includes(c.a.key));
          const mineB = stops.filter((s) => s.goalKeys.includes(c.b.key));
          const key = `x${synergies.length + 1}`;
          const afterA = mineA[b.afterStepA - 1]?.key;
          const afterB = mineB[b.afterStepB - 1]?.key;
          stops.push({
            key,
            goalKeys: [c.a.key, c.b.key],
            title: b.title,
            why: b.why,
            identity: b.identity,
            milestone: b.milestone,
            effortHours: Math.min(2000, Math.max(1, Math.round(b.effortHours))),
            minWeeks: Math.min(104, Math.max(1, Math.round(b.minWeeks))),
            kind: "build",
            dependsOn: [afterA, afterB].filter((k): k is string => !!k),
            origin: "bridge",
          });
          synergies.push({ stopKey: key, goalKeys: [c.a.key, c.b.key], reason: b.reason });
        });
      }

      const check = acyclic(stops.map((s) => ({ key: s.key, deps: s.dependsOn })));
      for (const s of stops) s.dependsOn = check.deps.get(s.key) ?? [];

      await ctx.runMutation(internal.route.saveGraph, {
        routeId,
        goals: goals.map((g) => ({ ...g, ...(g.afterWhy ? { afterWhy: g.afterWhy } : { afterWhy: undefined }) })),
        stops,
        synergies: synergies.map((s) => ({
          ...s,
          reason: s.reason || "Same stop on both routes, done once",
        })),
        merges,
      });
    } catch (e) {
      await ctx.runMutation(internal.route.setFailed, { routeId, error: message(e) });
    }
    return null;
  },
});
