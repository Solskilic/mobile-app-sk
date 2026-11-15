import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { arr, askJson, num, obj, oneOf, str } from "./openai";

const today = () => new Date().toISOString().slice(0, 10);
const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

export const clarify = internalAction({
  args: { goalId: v.id("goals") },
  returns: v.null(),
  handler: async (ctx, { goalId }) => {
    const goal = await ctx.runQuery(internal.goals.forAi, { goalId });
    if (!goal) return null;
    try {
      const out = await askJson<{ title: string; questions: { question: string; options: string[] }[] }>(
        "clarify",
        obj({
          title: str("The goal restated as a short title, max 6 words"),
          questions: arr(
            obj({
              question: str("One short question"),
              options: arr(str(), "Exactly 3 short tap-able answers, max 4 words each"),
            }),
            "Exactly 3 questions",
          ),
        }),
        `A person just typed this goal: "${goal.text}".
Ask exactly 3 short clarifying questions so you can judge realism and build a plan: their current level/starting point, the hours per week they can give, and their deadline or time horizon. Tailor wording to the goal. Give 3 quick answer options for each so setup takes under a minute.`,
      );
      await ctx.runMutation(internal.goals.saveQuestions, {
        goalId,
        title: out.title,
        questions: out.questions.slice(0, 3).map((q) => ({ question: q.question, options: q.options.slice(0, 4) })),
      });
    } catch (e) {
      await ctx.runMutation(internal.goals.setFailed, { goalId, error: message(e) });
    }
    return null;
  },
});

type Plan = {
  title: string;
  smart: { specific: string; measurable: string; achievable: string; relevant: string; timeBound: string; statement: string };
  verdict: { level: "realistic" | "stretch" | "unrealistic"; why: string; adjustment: string };
  estimateLabel: string;
  rungs: { title: string; identity: string; milestone: string; weeks: number; kind: "explore" | "build" }[];
};

export const plan = internalAction({
  args: { goalId: v.id("goals"), tomorrow: v.string() },
  returns: v.null(),
  handler: async (ctx, { goalId, tomorrow }) => {
    const goal = await ctx.runQuery(internal.goals.forAi, { goalId });
    if (!goal) return null;
    const answers = goal.questions.map((q) => `- ${q.question} -> ${q.answer}`).join("\n");
    try {
      const out = await askJson<Plan>(
        "plan",
        obj({
          title: str("Short goal title, max 6 words"),
          smart: obj({
            specific: str("S: what exactly, one line"),
            measurable: str("M: how progress is measured, one line"),
            achievable: str("A: why it fits their time and level, one line"),
            relevant: str("R: why it matters to them, one line"),
            timeBound: str("T: the date or horizon, one line"),
            statement: str("The full SMART goal in one sentence"),
          }),
          verdict: obj({
            level: oneOf(["realistic", "stretch", "unrealistic"]),
            why: str("Honest reason in 1-2 sentences, citing their numbers"),
            adjustment: str("One concrete suggested adjustment (even if realistic, how to make it safer)"),
          }),
          estimateLabel: str("Human estimate of total time to finish, e.g. '14 weeks at 4 h/week'"),
          rungs: arr(
            obj({
              title: str("Rung as a scaled target, e.g. '25 miles a month'"),
              identity: str("Identity line once reached, e.g. \"You're a 25-mile runner now\""),
              milestone: str("How they know they've reached it, one line"),
              weeks: num("Whole weeks this rung takes at their pace"),
              kind: oneOf(["explore", "build"]),
            }),
            "3 to 5 rungs, small to big. Career/academic pivots or fuzzy goals start with an 'explore' rung.",
          ),
        }),
        `Today is ${today()}. Goal: "${goal.text}".
Their answers:
${answers}

Rewrite the goal as SMART, give an honest realism verdict (do not flatter: if their hours or deadline do not fit, say unrealistic and suggest the fix), estimate time to finish at their stated pace, and build a ladder of 3-5 rungs that scale up (e.g. 5 -> 25 -> 75 miles). Rung weeks must add up to your estimate.`,
      );
      const rungs = out.rungs.slice(0, 5).map((r) => ({ ...r, weeks: Math.max(1, Math.round(r.weeks)) }));
      if (rungs.length < 2) throw new Error("Plan came back without a ladder");
      const saved = await ctx.runMutation(internal.goals.savePlan, {
        goalId,
        title: out.title,
        smart: out.smart,
        verdict: out.verdict,
        estimateLabel: out.estimateLabel,
        rungs,
      });
      if (saved) await generate(ctx, goal.deviceId, tomorrow);
    } catch (e) {
      await ctx.runMutation(internal.goals.setFailed, { goalId, error: message(e) });
    }
    return null;
  },
});

async function generate(ctx: ActionCtx, deviceId: string, forDate: string) {
  const goals = await ctx.runQuery(internal.goals.liveForAi, { deviceId });
  if (goals.length === 0) return;
  const context = goals
    .map((g, i) => {
      const rung = g.rungs[g.currentRung];
      const next = g.rungs[g.currentRung + 1];
      return `Goal #${i}: ${g.smart?.statement ?? g.title}
  current rung: ${rung?.title ?? "-"} (${rung?.milestone ?? ""})${rung?.kind === "explore" ? " [exploration]" : ""}
  next rung: ${next?.title ?? "finish line"}
  max minutes per task: ${g.minutesCap ?? 30}
  recently done: ${g.recentDone.join("; ") || "nothing yet"}`;
    })
    .join("\n");
  const out = await askJson<{ tasks: { goal: number; title: string; why: string; minutes: number }[] }>(
    "tomorrows_three",
    obj({
      tasks: arr(
        obj({
          goal: num("Goal # this task serves"),
          title: str("Concrete small task, max 8 words, starts with a verb"),
          why: str("One line: how this moves them up the current rung"),
          minutes: num("10, 20 or 30, never above the goal's max"),
        }),
        "Exactly 3 tasks",
      ),
    }),
    `Plan "tomorrow's three" for ${forDate}: exactly 3 small tasks spread across these active goals (every goal gets at least one if there are 3 or fewer). Each must climb toward the current rung, be doable in one sitting, and not repeat recent tasks.
${context}`,
  );
  const tasks = out.tasks.slice(0, 3).flatMap((t) => {
    const g = goals[t.goal] ?? goals[0];
    const cap = g.minutesCap ?? 30;
    return [{
      goalId: g._id as Id<"goals">,
      rungIndex: g.currentRung,
      title: t.title,
      why: t.why,
      minutes: Math.min(cap, Math.max(5, Math.round(t.minutes))),
    }];
  });
  await ctx.runMutation(internal.tasks.replaceForDate, { deviceId, forDate, tasks });
}

export const generateThree = internalAction({
  args: { deviceId: v.string(), forDate: v.string() },
  returns: v.null(),
  handler: async (ctx, { deviceId, forDate }) => {
    await generate(ctx, deviceId, forDate);
    return null;
  },
});

const oneTask = obj({
  title: str("Task, max 8 words, starts with a verb"),
  why: str("One line: how it moves them up the rung"),
  minutes: num("Minutes"),
});

export const swap = action({
  args: { taskId: v.id("tasks") },
  returns: v.null(),
  handler: async (ctx, { taskId }) => {
    const task = await ctx.runQuery(internal.tasks.forAi, { taskId });
    if (!task || task.status !== "open") return null;
    const out = await askJson<{ title: string; why: string; minutes: number }>(
      "swap",
      oneTask,
      `Goal: ${task.smart || task.goalTitle}. Current rung: ${task.rungTitle}.
They want to swap this task for something different: "${task.title}" (${task.minutes} min).
Give one different task of similar size (max ${task.minutesCap} minutes) that still climbs the same rung.`,
    );
    await ctx.runMutation(internal.tasks.rewrite, {
      taskId,
      title: out.title,
      why: out.why,
      minutes: Math.min(task.minutesCap, Math.max(5, Math.round(out.minutes))),
      shrunk: false,
    });
    return null;
  },
});

export const shrink = action({
  args: { taskId: v.id("tasks"), minutes: v.number() },
  returns: v.null(),
  handler: async (ctx, { taskId, minutes }) => {
    const task = await ctx.runQuery(internal.tasks.forAi, { taskId });
    if (!task || task.status !== "open") return null;
    const out = await askJson<{ title: string; why: string; minutes: number }>(
      "shrink",
      oneTask,
      `Goal: ${task.smart || task.goalTitle}. Current rung: ${task.rungTitle}.
Shrink this task to a ${minutes}-minute version that still counts: "${task.title}" (${task.minutes} min). Keep the spirit, cut the scope.`,
    );
    await ctx.runMutation(internal.tasks.rewrite, {
      taskId,
      title: out.title,
      why: out.why,
      minutes,
      shrunk: true,
    });
    return null;
  },
});

export const shrinkWeek = internalAction({
  args: { goalId: v.id("goals") },
  returns: v.null(),
  handler: async (ctx, { goalId }) => {
    const goal = await ctx.runQuery(internal.goals.forAi, { goalId });
    if (!goal) return null;
    const open = await ctx.runQuery(internal.tasks.openForGoal, { goalId });
    const rung = goal.rungs[goal.currentRung];
    const out = await askJson<{
      note: string;
      minutesCap: number;
      slipDays: number;
      rewrites: { title: string; minutes: number }[];
    }>(
      "shrink_week",
      obj({
        note: str("2 warm sentences to the person: what you changed this week and why. No guilt."),
        minutesCap: num("New max minutes per task for this goal next week (10-20)"),
        slipDays: num("Extra days to add to the projected finish (0-7)"),
        rewrites: arr(
          obj({ title: str("Smaller version of the task"), minutes: num("Minutes") }),
          "One per open task, same order",
        ),
      }),
      `They missed two tasks in a row on "${goal.smart?.statement ?? goal.title}" (current rung: ${rung?.title ?? "-"}, previous cap ${goal.minutesCap ?? 30} min/task).
Life happened. Shrink next week so it is easy to restart, and explain kindly.
Open tasks: ${open.map((t) => `"${t.title}" (${t.minutes} min)`).join("; ") || "none"}.`,
    );
    const cap = Math.min(20, Math.max(5, Math.round(out.minutesCap)));
    await ctx.runMutation(internal.tasks.applyWeekShrink, {
      goalId,
      note: out.note,
      minutesCap: cap,
      slipDays: Math.min(7, Math.max(0, Math.round(out.slipDays))),
      rewrites: open.flatMap((t, i) => {
        const r = out.rewrites[i];
        return r ? [{ taskId: t._id, title: r.title, minutes: Math.min(cap, Math.max(5, Math.round(r.minutes))) }] : [];
      }),
    });
    return null;
  },
});

export const research = internalAction({
  args: { goalId: v.id("goals") },
  returns: v.null(),
  handler: async (ctx, { goalId }) => {
    const goal = await ctx.runQuery(internal.goals.forAi, { goalId });
    if (!goal) return null;
    try {
      const out = await askJson<{ resources: { name: string; type: string; why: string; url: string }[] }>(
        "research",
        obj({
          resources: arr(
            obj({
              name: str("Name of a real, well-known resource"),
              type: oneOf(["course", "program", "community", "app", "book", "other"]),
              why: str("One line: why it fits this goal and rung"),
              url: str("Official homepage URL if you are confident, else empty string"),
            }),
            "5 to 6 resources",
          ),
        }),
        `Suggest what's available for this goal: real courses, programs, communities, apps or books that exist. Prefer free or well-known options.
Goal: ${goal.smart?.statement ?? goal.text}
Ladder: ${goal.rungs.map((r) => r.title).join(" -> ")}`,
      );
      await ctx.runMutation(internal.goals.saveResources, { goalId, resources: out.resources.slice(0, 6) });
    } catch {
      await ctx.runMutation(internal.goals.saveResources, { goalId });
    }
    return null;
  },
});
