export type Dedication = "casual" | "steady" | "allIn";

export const HOURS_PER_WEEK: Record<Dedication, number> = { casual: 3, steady: 6, allIn: 12 };
export const DEDICATION_LABEL: Record<Dedication, string> = { casual: "Casual", steady: "Steady", allIn: "All-in" };
export const MAX_CONCURRENT = 2;

export type GraphGoal = { key: string; title: string; weeklyHours: number; after: string[] };
export type GraphStop = {
  key: string;
  goalKeys: string[];
  effortHours: number;
  minWeeks: number;
  dependsOn: string[];
  done: boolean;
};

export type Season = "done" | "now" | "next" | "later";
export type PlannedGoal = { key: string; startWeek: number; endWeek: number; season: Season; load: number; hostStops: string[] };
export type PlannedStop = { key: string; host: string | null; startWeek: number; endWeek: number; season: Season };
export type Schedule = {
  capacity: number;
  totalWeeks: number;
  goals: PlannedGoal[];
  stops: PlannedStop[];
  droppedEdges: { from: string; to: string }[];
  savedHours: number;
};

export function cosine(a: number[], b: number[]) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function acyclic<T extends { key: string; deps: string[] }>(nodes: T[]) {
  const keys = new Set(nodes.map((n) => n.key));
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const dropped: { from: string; to: string }[] = [];
  const deps = new Map(nodes.map((n) => [n.key, n.deps.filter((d) => keys.has(d) && d !== n.key)]));
  const state = new Map<string, 1 | 2>();
  const order: string[] = [];
  const visit = (key: string) => {
    state.set(key, 1);
    for (const dep of [...(deps.get(key) ?? [])]) {
      const s = state.get(dep);
      if (s === 1) {
        deps.set(key, (deps.get(key) ?? []).filter((d) => d !== dep));
        dropped.push({ from: dep, to: key });
      } else if (!s) visit(dep);
    }
    state.set(key, 2);
    order.push(key);
  };
  for (const n of nodes) if (!state.get(n.key)) visit(n.key);
  return { order: order.map((k) => byKey.get(k)!), deps, dropped };
}

export function schedule(input: {
  goals: GraphGoal[];
  stops: GraphStop[];
  hoursPerWeek: number;
  pace: number;
  maxConcurrent?: number;
}): Schedule {
  const maxConcurrent = input.maxConcurrent ?? MAX_CONCURRENT;
  const capacity = Math.max(1, input.hoursPerWeek * input.pace);
  const goalDag = acyclic(input.goals.map((g) => ({ ...g, deps: g.after })));
  const goalRank = new Map(goalDag.order.map((g, i) => [g.key, i]));
  const goalByKey = new Map(input.goals.map((g) => [g.key, g]));
  const raw = input.stops.map((s) => ({
    ...s,
    deps: [...new Set([
      ...s.dependsOn,
      ...s.goalKeys.flatMap((key) =>
        (goalDag.deps.get(key) ?? []).flatMap((before) =>
          input.stops.filter((p) => p.goalKeys.includes(before) && !p.goalKeys.includes(key)).map((p) => p.key),
        ),
      ),
    ])],
  }));
  raw.sort((a, b) =>
    Math.min(...a.goalKeys.map((k) => goalRank.get(k) ?? 99)) -
    Math.min(...b.goalKeys.map((k) => goalRank.get(k) ?? 99)),
  );
  const dag = acyclic(raw);
  const plans = new Map<string, PlannedStop>();
  const reservations: { start: number; end: number; load: number; goals: string[] }[] = [];
  const ownerByKey = new Map<string, string>();
  for (const s of dag.order) {
    const host = [...s.goalKeys].sort((a, b) => (goalRank.get(a) ?? 99) - (goalRank.get(b) ?? 99))[0];
    ownerByKey.set(s.key, host);
    if (s.done) {
      plans.set(s.key, { key: s.key, host, startWeek: 0, endWeek: 0, season: "done" });
      continue;
    }
    const load = Math.min(capacity, Math.max(1, goalByKey.get(host)?.weeklyHours ?? 1));
    const duration = Math.max(1, s.minWeeks, Math.ceil(s.effortHours / load));
    let first = Math.max(0, ...(dag.deps.get(s.key) ?? []).map((d) => plans.get(d)?.endWeek ?? 0));
    for (;;) {
      let conflictEnd = 0;
      for (let w = first; w < first + duration; w++) {
        const overlap = reservations.filter((r) => r.start <= w && r.end > w);
        const used = overlap.reduce((sum, r) => sum + r.load, 0);
        const activeGoals = new Set([...overlap.flatMap((r) => r.goals), host]);
        const sameGoal = overlap.some((r) => r.goals.includes(host));
        if (used + load > capacity + 0.000001 || activeGoals.size > maxConcurrent || sameGoal) {
          conflictEnd = Math.max(conflictEnd, Math.min(...overlap.map((r) => r.end)));
          break;
        }
      }
      if (!conflictEnd) break;
      first = Math.max(first + 1, conflictEnd);
    }
    reservations.push({ start: first, end: first + duration, load, goals: [host] });
    plans.set(s.key, { key: s.key, host, startWeek: first, endWeek: first + duration, season: "later" });
  }
  const goals: PlannedGoal[] = input.goals.map((g) => {
    const mine = input.stops.filter((s) => s.goalKeys.includes(g.key)).map((s) => plans.get(s.key)!);
    const unfinished = mine.filter((s) => s.season !== "done");
    const hosted = unfinished.filter((s) => s.host === g.key);
    return {
      key: g.key,
      startWeek: hosted.length ? Math.min(...hosted.map((s) => s.startWeek)) : unfinished.length ? Math.max(...unfinished.map((s) => s.endWeek)) : 0,
      endWeek: Math.max(0, ...mine.map((s) => s.endWeek)),
      season: unfinished.length ? "later" : "done",
      load: Math.min(capacity, Math.max(1, g.weeklyHours)),
      hostStops: mine.filter((s) => ownerByKey.get(s.key) === g.key).map((s) => s.key),
    };
  });
  const nextStart = Math.min(...goals.filter((g) => g.startWeek > 0).map((g) => g.startWeek));
  for (const g of goals) {
    if (g.season === "done") continue;
    g.season = g.startWeek === 0 ? "now" : g.startWeek === nextStart ? "next" : "later";
  }
  for (const p of plans.values()) {
    if (p.season === "done") continue;
    p.season = goals.find((g) => g.key === p.host)?.season ?? "later";
  }
  return {
    capacity,
    totalWeeks: Math.max(0, ...goals.map((g) => g.endWeek)),
    goals,
    stops: [...plans.values()].sort((a, b) => a.startWeek - b.startWeek),
    droppedEdges: [...goalDag.dropped, ...dag.dropped],
    savedHours: Math.round(input.stops.filter((s) => s.goalKeys.length > 1)
      .reduce((sum, s) => sum + s.effortHours * (s.goalKeys.length - 1), 0)),
  };
}

export type Outcome = { forDate: string; status: "done" | "missed"; minutes: number; completedAt?: number };

export type Adherence = {
  state: "new" | "onTrack" | "drifting" | "lapsed";
  pace: number;
  minutesCap: number;
  weekdayStrength: number[];
  missedDaysInRow: number;
  idleDays: number;
  resolved: number;
  shortBeatsLong: boolean;
  bestDays: number[];
  weakDays: number[];
};

const sizeOf = (minutes: number) => (minutes <= 10 ? 0 : minutes <= 20 ? 1 : 2);
const dayIndex = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
const daysBetween = (a: string, b: string) => {
  const ms = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(b) - ms(a)) / 86_400_000);
};

export function adherence(outcomes: Outcome[], today: string): Adherence {
  const resolved = outcomes.filter((o) => o.forDate < today);
  const rate = (list: Outcome[], prior = 2) =>
    (list.filter((o) => o.status === "done").length + prior * 0.7) / (list.length + prior);
  const overall = rate(resolved);
  const weekdayStrength = [0, 1, 2, 3, 4, 5, 6].map((d) => rate(resolved.filter((o) => dayIndex(o.forDate) === d)));
  const bySize = [0, 1, 2].map((s) => rate(resolved.filter((o) => sizeOf(o.minutes) === s), 3));
  const minutesCap = resolved.length < 3 ? 30 : bySize[2] >= 0.6 ? 30 : bySize[1] >= 0.6 ? 20 : 10;

  const days = [...new Set(resolved.map((o) => o.forDate))].sort().reverse();
  let missedDaysInRow = 0;
  for (const day of days) {
    if (resolved.some((o) => o.forDate === day && o.status === "done")) break;
    missedDaysInRow++;
  }
  const lastDone = resolved.filter((o) => o.status === "done").map((o) => o.forDate).sort().pop();
  const idleDays = lastDone ? Math.max(0, daysBetween(lastDone, today) - 1) : resolved.length ? days.length : 0;

  const recent = resolved.filter((o) => daysBetween(o.forDate, today) <= 7);
  const recentRate = rate(recent);
  let state: Adherence["state"] = "onTrack";
  if (resolved.length < 3) state = "new";
  else if (missedDaysInRow >= 3 || idleDays >= 4) state = "lapsed";
  else if (missedDaysInRow >= 2 || (recent.length >= 3 && recentRate < 0.5)) state = "drifting";

  const ranked = weekdayStrength
    .map((v, d) => ({ v, d, n: resolved.filter((o) => dayIndex(o.forDate) === d).length }))
    .filter((x) => x.n >= 2);
  const bestDays = ranked.filter((x) => x.v >= overall + 0.1).sort((a, b) => b.v - a.v).slice(0, 2).map((x) => x.d);
  const weakDays = ranked.filter((x) => x.v <= overall - 0.15).sort((a, b) => a.v - b.v).slice(0, 2).map((x) => x.d);

  return {
    state,
    pace: Math.min(1, Math.max(0.5, overall + 0.15)),
    minutesCap,
    weekdayStrength,
    missedDaysInRow,
    idleDays,
    resolved: resolved.length,
    shortBeatsLong: resolved.filter((o) => sizeOf(o.minutes) === 0).length >= 3 &&
      resolved.filter((o) => sizeOf(o.minutes) === 2).length >= 2 && bySize[0] - bySize[2] >= 0.15,
    bestDays,
    weakDays,
  };
}

export const DAY_NAMES = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

export function weekdayOf(key: string) {
  return dayIndex(key);
}

export function addDays(key: string, n: number) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return date.toISOString().slice(0, 10);
}
