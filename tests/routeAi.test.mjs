import assert from "node:assert/strict";
import { test } from "node:test";
import { getFunctionName } from "convex/server";
import { build } from "../convex/routeAi.ts";

const step = (title, dependsOn = []) => ({
  title, why: title, identity: "A new chapter", milestone: title, effortHours: 8, minWeeks: 2, kind: "build", dependsOn,
});
function harness({ failEmbedding = false, approveMerge = true } = {}) {
  const writes = [];
  const route = { _id: "route", status: "building", input: "Run, make local friends", dedication: "steady" };
  const names = [];
  const ctx = {
    async runQuery() { return route; },
    async runMutation(ref, args) { writes.push({ name: getFunctionName(ref), args }); },
  };
  const fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    if (url.endsWith("/embeddings")) {
      if (failEmbedding) return new Response(JSON.stringify({ data: [] }));
      return new Response(JSON.stringify({
        data: body.input.map((text, index) => ({
          index,
          embedding: text.includes("run club") ? [1, 0, 0, 0] :
            text.includes("Run") || text.includes("distance") ? [0, 1, 0, 0] : [0, 0, 1, 0],
        })),
      }));
    }
    const name = body.text.format.name;
    names.push(name);
    let result;
    if (name === "split_goals") result = {
      goals: [
        { title: "Run", summary: "Build distance", weeklyHours: 4 },
        { title: "Make local friends", summary: "Find a community", weeklyHours: 2 },
      ], prerequisites: [],
    };
    else if (name === "decompose_goal") result = {
      steps: body.input[1].content.includes("Goal: Run.")
        ? [step("Join a run club"), step("Build distance", [1])]
        : [step("Join a run club"), step("Invite a friend", [1])],
    };
    else if (name === "confirm_duplicate_stops") result = { pairs: [{ pair: 1, sameOutcome: approveMerge }] };
    else if (name === "bridges") result = { bridges: [] };
    else throw new Error(name);
    return new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(result) }] }] }));
  };
  return { ctx, writes, fetch, names };
}

test("structured decomposition -> real embedding path -> confirmed merge -> bounded graph save", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  const h = harness();
  try {
    globalThis.fetch = h.fetch;
    process.env.OPENAI_API_KEY = "test-placeholder";
    await build._handler(h.ctx, { routeId: "route" });
    const saved = h.writes.find((w) => w.name === "route:saveGraph");
    assert.ok(saved);
    assert.equal(saved.args.goals.length, 2);
    assert.equal(saved.args.stops.length, 3);
    const shared = saved.args.stops.find((s) => s.goalKeys.length === 2);
    assert.equal(shared.title, "Join a run club");
    assert.equal(saved.args.merges.length, 1);
    assert.ok(saved.args.stops.every((s) => s.dependsOn.every((key) => saved.args.stops.some((p) => p.key === key))));
    assert.ok(h.names.includes("confirm_duplicate_stops"));
    assert.equal(h.writes.some((w) => w.name === "route:setFailed"), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
  }
});
test("similar embeddings alone cannot merge different outcomes", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  const h = harness({ approveMerge: false });
  try {
    globalThis.fetch = h.fetch; process.env.OPENAI_API_KEY = "test-placeholder";
    await build._handler(h.ctx, { routeId: "route" });
    const saved = h.writes.find((w) => w.name === "route:saveGraph");
    assert.ok(saved);
    assert.equal(saved.args.merges.length, 0);
    assert.equal(saved.args.stops.length, 4);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
  }
});
test("embedding failure leaves a retryable draft instead of a fake graph", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  const h = harness({ failEmbedding: true });
  try {
    globalThis.fetch = h.fetch; process.env.OPENAI_API_KEY = "test-placeholder";
    await build._handler(h.ctx, { routeId: "route" });
    assert.ok(h.writes.some((w) => w.name === "route:setFailed" && w.args.error.includes("incomplete embeddings")));
    assert.equal(h.writes.some((w) => w.name === "route:saveGraph"), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
  }
});
