import assert from "node:assert/strict";
import { test } from "node:test";
import { acyclic, cosine, schedule } from "../convex/routeEngine.ts";
import { DEMO_GOALS, DEMO_STOPS } from "../convex/routeSample.ts";

const node = (key, goalKeys, effortHours = 6, dependsOn = [], minWeeks = 1) =>
  ({ key, goalKeys, effortHours, dependsOn, minWeeks, done: false });
const goal = (key, weeklyHours = 3, after = []) => ({ key, weeklyHours, after });
const run = (goals, stops, hoursPerWeek = 6, pace = 1) => schedule({ goals, stops, hoursPerWeek, pace });

function invariant(goals, stops, plan) {
  const byKey = new Map(plan.stops.map((p) => [p.key, p]));
  assert.equal(byKey.size, stops.length);
  for (const s of stops) {
    const p = byKey.get(s.key);
    if (s.done) { assert.equal(p.season, "done"); continue; }
    assert.ok(p.endWeek - p.startWeek >= Math.max(1, s.minWeeks));
    for (const d of s.dependsOn) {
      if (!byKey.has(d) || plan.droppedEdges.some((e) => e.from === d && e.to === s.key)) continue;
      assert.ok(p.startWeek >= byKey.get(d).endWeek, `${s.key} cannot start before ${d}`);
    }
  }
  for (let w = 0; w < plan.totalWeeks; w++) {
    const active = plan.stops.filter((s) => s.startWeek <= w && s.endWeek > w);
    const hosts = active.map((s) => s.host);
    assert.equal(hosts.length, new Set(hosts).size, "one stop per focus goal at a time");
    assert.ok(new Set(hosts).size <= 2);
    const load = active.reduce((sum, s) => sum + Math.min(plan.capacity, Math.max(1, goals.find((g) => g.key === s.host).weeklyHours)), 0);
    assert.ok(load <= plan.capacity + 1e-6, `week ${w} over capacity`);
  }
}

test("topological order removes cycles deterministically", () => {
  const cyclic = [{ key: "a", deps: ["b"] }, { key: "b", deps: ["a"] }, { key: "c", deps: ["missing", "c"] }];
  assert.deepEqual(acyclic(cyclic).dropped, [{ from: "a", to: "b" }]);
  assert.deepEqual(acyclic(cyclic).order.map((n) => n.key), ["b", "a", "c"]);
});
test("cosine handles empty and matching vectors", () => {
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([0, 0], [1, 0]), 0);
  assert.equal(cosine([1, 0], [0, 1]), 0);
});
test("single goal still has an ordered ladder", () => {
  const goals = [goal("run")], stops = [node("base", ["run"]), node("race", ["run"], 12, ["base"])];
  const p = run(goals, stops);
  assert.equal(p.goals[0].season, "now");
  assert.equal(p.totalWeeks, 6);
  invariant(goals, stops, p);
});
test("capacity packing overlaps compatible goals and holds others back", () => {
  const goals = [goal("a", 4), goal("b", 4), goal("c", 2)];
  const stops = goals.map((g) => node(g.key, [g.key], 8));
  const p = run(goals, stops);
  assert.equal(p.goals.find((g) => g.key === "a").startWeek, 0);
  assert.equal(p.goals.find((g) => g.key === "c").startWeek, 0);
  assert.ok(p.goals.find((g) => g.key === "b").startWeek > 0);
  invariant(goals, stops, p);
});
test("hard goal prerequisites wait for every prerequisite stop", () => {
  const goals = [goal("a"), goal("b", 3, ["a"])];
  const stops = [node("a1", ["a"]), node("a2", ["a"], 6, ["a1"]), node("b1", ["b"])];
  const p = run(goals, stops);
  assert.ok(p.goals[1].startWeek >= p.goals[0].endWeek);
  invariant(goals, stops, p);
});
test("shared stop is packed once and does not activate every beneficiary", () => {
  const goals = ["a", "b", "c", "d"].map((k) => goal(k, 2));
  const stops = [node("shared", goals.map((g) => g.key)), ...goals.map((g) => node(g.key, [g.key], 4, ["shared"]))];
  const p = run(goals, stops);
  assert.equal(p.stops.filter((s) => s.key === "shared").length, 1);
  assert.equal(p.savedHours, 18);
  assert.ok(p.goals.filter((g) => g.season === "now").length <= 2);
  invariant(goals, stops, p);
});
test("shared stop respects prerequisites from both goals", () => {
  const goals = [goal("a"), goal("b")];
  const stops = [node("firstA", ["a"]), node("firstB", ["b"]), node("shared", ["a", "b"], 6, ["firstA", "firstB"])];
  const p = run(goals, stops);
  invariant(goals, stops, p);
});
test("completing a shared stop preserves credit across beneficiaries", () => {
  const goals = [goal("a"), goal("b")];
  const stops = [{ ...node("shared", ["a", "b"]), done: true }, node("next", ["b"], 6, ["shared"])];
  const p = run(goals, stops);
  assert.equal(p.goals[0].season, "done");
  assert.equal(p.goals[1].season, "now");
  invariant(goals, stops, p);
});
test("lower observed pace makes more room rather than compressing tasks", () => {
  const goals = [goal("a", 6)], stops = [node("a", ["a"], 24)];
  assert.ok(run(goals, stops, 6, 0.5).totalWeeks > run(goals, stops).totalWeeks);
});
test("demo has several seasons and two concrete synergies", () => {
  const stops = DEMO_STOPS.map((s) => ({ ...s, done: false }));
  const p = run(DEMO_GOALS, stops);
  assert.ok(p.goals.some((g) => g.season === "now"));
  assert.ok(p.goals.some((g) => g.season !== "now"));
  assert.equal(stops.filter((s) => s.goalKeys.length > 1).length, 2);
  invariant(DEMO_GOALS, stops, p);
});
test("random bounded DAGs keep capacity and dependency invariants", () => {
  let seed = 71;
  const rand = (n) => { seed = (seed * 16807) % 2147483647; return seed % n; };
  for (let trial = 0; trial < 80; trial++) {
    const goals = Array.from({ length: 2 + rand(5) }, (_, i) => goal("g" + i, 1 + rand(6)));
    const stops = Array.from({ length: 4 + rand(22) }, (_, i) =>
      node("s" + i, [goals[rand(goals.length)].key], 1 + rand(16), i && rand(2) ? ["s" + rand(i)] : [], 1 + rand(3)));
    const p = run(goals, stops, 3 + rand(10));
    invariant(goals, stops, p);
  }
});
