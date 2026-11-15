/// <reference types="vite/client" />
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const step = (title: string, dependsOn: number[] = []) => ({
  title, why: title, identity: title, milestone: title, effortHours: 8, minWeeks: 2, kind: "build", dependsOn,
});
const response = (result: unknown) => Response.json({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(result) }] }] });
beforeEach(() => { vi.useFakeTimers(); vi.stubEnv("OPENAI_API_KEY", "test-placeholder"); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function pipeline(mode: "merge" | "reject" | "failure" | "chain" | "bridge") {
  const t = convexTest(schema, modules);
  const routeId = await t.run((ctx) => ctx.db.insert("routes", { deviceId: "a", input: "Run and make friends", dedication: "steady", startDate: "2026-11-15", status: "building", goals: [], stops: [], synergies: [], merges: [] }));
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    if (url.endsWith("/embeddings")) {
      let vectors: number[][];
      if (mode === "failure") vectors = [];
      else if (mode === "chain") vectors = [[0, 0, 0, 1], [0, 0, 0, 1], [0, 0, 0, 1], [1, 0, 0, 0], [.94, .342, 0, 0], [.906, .423, 0, 0], [0, 0, 1, 0]];
      else if (mode === "bridge") vectors = body.input.length === 1 ? [[.9, .44]] : [[1, 0], [.5, .866], [1, 0], [0, 1]];
      else vectors = body.input.map((text: string) => text.includes("run club") ? [1, 0, 0] : text.includes("Run") || text.includes("distance") ? [0, 1, 0] : [0, 0, 1]);
      return Response.json({ data: vectors.map((embedding, index) => ({ index, embedding })) });
    }
    const name = body.text.format.name;
    if (name === "split_goals") return response({ goals: mode === "chain"
      ? ["A", "B", "C"].map((title) => ({ title, summary: title, weeklyHours: 2 }))
      : [
        { title: "Run", summary: "Build distance", weeklyHours: 4, horizon: { kind: "byDate", date: "2027-10-01", detail: "Race" } },
        { title: "Friends", summary: "Find community", weeklyHours: 2, horizon: { kind: "recurring", date: "", detail: "A social rhythm" } },
      ], prerequisites: [] });
    if (name === "decompose_goal") {
      const prompt = body.input[1].content as string;
      if (mode === "chain") return response({ steps: prompt.includes("Goal: C.") ? [step("Club C"), step("After C", [1])] : [step(prompt.includes("Goal: A.") ? "Club A" : "Club B")] });
      if (mode === "bridge") return response({ steps: [step(prompt.includes("Goal: Run.") ? "Solo 5K" : "Meet people")] });
      return response({ steps: prompt.includes("Goal: Run.") ? [step("Join a run club"), step("Build distance", [1])] : [step("Join a run club"), step("Invite a friend", [1])] });
    }
    if (name === "confirm_duplicate_stops") return response({ pairs: (mode === "chain" ? [1, 2, 3] : [1]).map((pair) => ({ pair, sameOutcome: mode !== "reject" })) });
    if (name === "bridges") return response({ bridges: mode === "bridge" ? [{
      pair: 1, fits: true, title: "Run 5K with a club", why: "Miles and friends", identity: "Club runner", milestone: "Run with people",
      effortHours: 3, minWeeks: 1, afterStepA: 0, afterStepB: 0, reason: "Miles and friends",
    }] : [] });
    throw new Error(name);
  }));
  await t.action(internal.routeAi.build, { routeId });
  return (await t.query(api.route.get, { routeId, today: "2026-11-15" }))!.route;
}
test("strict decomposition and embeddings save a confirmed shared stop through API validators", async () => {
  const route = await pipeline("merge");
  expect(route.status).toBe("ready"); expect(route.stops).toHaveLength(3); expect(route.merges).toHaveLength(1);
  expect(route.stops.find((s) => s.goalKeys.length === 2)!.title).toBe("Join a run club");
  expect(route.goals[0].horizon!.date).toBe("2027-10-01");
  expect(route.goals[1].horizon!.kind).toBe("recurring");
});
test("similarity without semantic confirmation cannot merge outcomes", async () => {
  const route = await pipeline("reject");
  expect(route.status).toBe("ready"); expect(route.merges).toHaveLength(0); expect(route.stops).toHaveLength(4);
});
test("embedding failure leaves a retryable draft instead of a fake graph", async () => {
  const route = await pipeline("failure");
  expect(route.status).toBe("failed"); expect(route.error).toMatch(/incomplete embeddings/); expect(route.stops).toHaveLength(0);
});
test("chained merges preserve prerequisite edges and canonicalize shared metadata", async () => {
  const route = await pipeline("chain");
  expect(route.status).toBe("ready");
  expect(route.stops.find((s) => s.key === "g3.s2")!.dependsOn).toEqual(["g1.s1"]);
  expect(route.stops.find((s) => s.key === "g1.s1")!.goalKeys).toHaveLength(3);
  expect(route.merges.every((m) => m.stopKey === "g1.s1")).toBe(true); expect(route.synergies).toHaveLength(1);
});
test("a bridge stays distinct from a similar solo milestone", async () => {
  const route = await pipeline("bridge");
  expect(route.status).toBe("ready");
  expect(route.stops.find((s) => s.title === "Solo 5K")!.goalKeys).toHaveLength(1);
  expect(route.stops.find((s) => s.title === "Run 5K with a club")!.goalKeys).toHaveLength(2);
});
