import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import schema from "./schema";
import type { Doc } from "./_generated/dataModel";

function taskTarget(task: Doc<"tasks">) {
  return {
    targetSnapshot: JSON.stringify([
      task.goalId,
      task.rungIndex,
      task.title,
      task.why,
      task.minutes,
      task.forDate,
    ]),
    criteria: `Step: ${task.title}\nPlanned practice time: ${task.minutes} minutes.\nPurpose: ${task.why}`,
  };
}

function practiceTarget(step: Doc<"practice">) {
  return {
    targetSnapshot: JSON.stringify([
      step.goalId,
      step.rungIndex,
      step.title,
      step.minutes,
      step.howTo,
    ]),
    criteria: `Step: ${step.title ?? ""}\nPlanned practice time: ${step.minutes ?? 15} minutes.\nInstructions: ${step.howTo ?? ""}`,
  };
}

function sourceOf(url: string) {
  const host = new URL(url).hostname.replace(/^www\.|^m\./, "");
  if (
    host === "youtu.be" ||
    host === "youtube.com" ||
    host.endsWith(".youtube.com")
  )
    return "youtube" as const;
  if (host === "tiktok.com" || host.endsWith(".tiktok.com"))
    return "tiktok" as const;
  return "article" as const;
}

export const addLink = mutation({
  args: { goalId: v.id("goals"), url: v.string() },
  returns: v.union(v.id("practice"), v.literal("badUrl")),
  handler: async (ctx, { goalId, url }) => {
    const goal = await ctx.db.get("goals", goalId);
    if (!goal) throw new Error("Goal not found");
    const trimmed = url.trim();
    if (!trimmed || trimmed.length > 2048) return "badUrl" as const;
    const full = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    let source;
    try {
      const parsed = new URL(full);
      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password ||
        !parsed.hostname.includes(".")
      )
        return "badUrl" as const;
      source = sourceOf(full);
    } catch {
      return "badUrl" as const;
    }
    const practiceId = await ctx.db.insert("practice", {
      deviceId: goal.deviceId,
      goalId,
      rungIndex: goal.currentRung,
      url: full,
      source,
      status: "fetching",
    });
    await ctx.scheduler.runAfter(0, internal.practiceAi.makeStep, {
      practiceId,
    });
    return practiceId;
  },
});

export const addNote = mutation({
  args: { practiceId: v.id("practice"), note: v.string() },
  returns: v.null(),
  handler: async (ctx, { practiceId, note }) => {
    const item = await ctx.db.get("practice", practiceId);
    if (
      !item ||
      !note.trim() ||
      item.status === "fetching" ||
      item.status === "ready"
    )
      return null;
    await ctx.db.patch("practice", practiceId, {
      userNote: note.trim().slice(0, 2000),
      status: "fetching",
      error: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.practiceAi.makeStep, {
      practiceId,
    });
    return null;
  },
});

export const setPracticeDone = mutation({
  args: { practiceId: v.id("practice"), done: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { practiceId, done }) => {
    const item = await ctx.db.get("practice", practiceId);
    if (!item || item.status !== "ready") return null;
    await ctx.db.patch("practice", practiceId, {
      doneAt: done ? Date.now() : undefined,
    });
    return null;
  },
});

export const removePractice = mutation({
  args: { practiceId: v.id("practice") },
  returns: v.null(),
  handler: async (ctx, { practiceId }) => {
    await ctx.db.delete("practice", practiceId);
    return null;
  },
});

export const forGoal = query({
  args: { goalId: v.id("goals") },
  returns: v.array(schema.doc("practice")),
  handler: async (ctx, { goalId }) => {
    return await ctx.db
      .query("practice")
      .withIndex("by_goal", (q) => q.eq("goalId", goalId))
      .order("desc")
      .take(20);
  },
});

export const addProof = mutation({
  args: {
    image: v.bytes(),
    mimeType: v.string(),
    taskId: v.optional(v.id("tasks")),
    practiceId: v.optional(v.id("practice")),
    goalId: v.optional(v.id("goals")),
    today: v.string(),
  },
  returns: v.id("proofs"),
  handler: async (
    ctx,
    { image, mimeType, taskId, practiceId, goalId, today },
  ) => {
    if ([taskId, practiceId, goalId].filter(Boolean).length !== 1)
      throw new Error("Choose one step or goal");
    const task = taskId ? await ctx.db.get("tasks", taskId) : null;
    const item = practiceId ? await ctx.db.get("practice", practiceId) : null;
    if ((taskId && !task) || (practiceId && (!item || item.status !== "ready")))
      throw new Error("Step not found");
    const target = task?.goalId ?? item?.goalId ?? goalId;
    const goal = target ? await ctx.db.get("goals", target) : null;
    if (!goal) throw new Error("Goal not found");
    if (
      !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
        mimeType,
      ) ||
      image.byteLength === 0 ||
      image.byteLength > 10 * 1024 * 1024
    )
      throw new Error("Choose a JPG, PNG, WebP or GIF under 10 MB");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error("Invalid date");
    const storageId = await ctx.storage.store(
      new Blob([image], { type: mimeType }),
    );
    const proofId = await ctx.db.insert("proofs", {
      deviceId: goal.deviceId,
      goalId: goal._id,
      taskId: task?._id,
      practiceId: item?._id,
      storageId,
      forTitle: task?.title ?? item?.title ?? goal.title,
      ...(task
        ? taskTarget(task)
        : item
          ? practiceTarget(item)
          : { criteria: goal.smart?.statement ?? goal.title }),
      today,
      status: "checking",
    });
    await ctx.scheduler.runAfter(0, internal.practiceAi.checkProof, {
      proofId,
    });
    return proofId;
  },
});

export const removeProof = mutation({
  args: { proofId: v.id("proofs") },
  returns: v.null(),
  handler: async (ctx, { proofId }) => {
    const proof = await ctx.db.get("proofs", proofId);
    if (!proof) return null;
    await ctx.storage.delete(proof.storageId);
    await ctx.db.delete("proofs", proofId);
    return null;
  },
});

export const retryProof = mutation({
  args: { proofId: v.id("proofs") },
  returns: v.null(),
  handler: async (ctx, { proofId }) => {
    const proof = await ctx.db.get("proofs", proofId);
    if (!proof || proof.status !== "failed") return null;
    await ctx.db.patch("proofs", proofId, {
      status: "checking",
      error: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.practiceAi.checkProof, {
      proofId,
    });
    return null;
  },
});

export const cleanupGoal = internalMutation({
  args: { goalId: v.id("goals") },
  returns: v.null(),
  handler: async (ctx, { goalId }) => {
    const steps = await ctx.db
      .query("practice")
      .withIndex("by_goal", (q) => q.eq("goalId", goalId))
      .take(50);
    const proofs = await ctx.db
      .query("proofs")
      .withIndex("by_goal", (q) => q.eq("goalId", goalId))
      .take(50);
    for (const proof of proofs) {
      await ctx.storage.delete(proof.storageId);
      await ctx.db.delete("proofs", proof._id);
    }
    for (const step of steps) await ctx.db.delete("practice", step._id);
    if (steps.length === 50 || proofs.length === 50)
      await ctx.scheduler.runAfter(0, internal.practice.cleanupGoal, {
        goalId,
      });
    return null;
  },
});

export const gallery = query({
  args: { goalId: v.id("goals") },
  returns: v.array(
    schema.doc("proofs").extend({ url: v.union(v.string(), v.null()) }),
  ),
  handler: async (ctx, { goalId }) => {
    const proofs = await ctx.db
      .query("proofs")
      .withIndex("by_goal", (q) => q.eq("goalId", goalId))
      .order("desc")
      .take(30);
    return await Promise.all(
      proofs.map(async (p) => ({
        ...p,
        url: await ctx.storage.getUrl(p.storageId),
      })),
    );
  },
});

export const forTask = query({
  args: { taskId: v.id("tasks") },
  returns: v.union(
    v.null(),
    schema.doc("proofs").extend({ url: v.union(v.string(), v.null()) }),
  ),
  handler: async (ctx, { taskId }) => {
    const proof = await ctx.db
      .query("proofs")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .order("desc")
      .first();
    return proof
      ? { ...proof, url: await ctx.storage.getUrl(proof.storageId) }
      : null;
  },
});

export const practiceForAi = internalQuery({
  args: { practiceId: v.id("practice") },
  returns: v.union(
    v.null(),
    v.object({
      item: schema.doc("practice"),
      goal: v.union(v.null(), schema.doc("goals")),
      rung: v.union(v.null(), schema.doc("rungs")),
    }),
  ),
  handler: async (ctx, { practiceId }) => {
    const item = await ctx.db.get("practice", practiceId);
    if (!item) return null;
    const goal = await ctx.db.get("goals", item.goalId);
    const rung = await ctx.db
      .query("rungs")
      .withIndex("by_goal_and_index", (q) =>
        q.eq("goalId", item.goalId).eq("index", item.rungIndex),
      )
      .unique();
    return { item, goal, rung };
  },
});

export const savePractice = internalMutation({
  args: {
    practiceId: v.id("practice"),
    status: v.union(
      v.literal("needsNote"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    sourceTitle: v.optional(v.string()),
    found: v.optional(v.string()),
    ask: v.optional(v.string()),
    title: v.optional(v.string()),
    minutes: v.optional(v.number()),
    howTo: v.optional(v.string()),
    why: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { practiceId, ...fields }) => {
    if (!(await ctx.db.get("practice", practiceId))) return null;
    await ctx.db.patch("practice", practiceId, fields);
    return null;
  },
});

export const proofForAi = internalQuery({
  args: { proofId: v.id("proofs") },
  returns: v.union(
    v.null(),
    v.object({
      proof: schema.doc("proofs"),
      goal: v.union(v.null(), schema.doc("goals")),
      url: v.union(v.null(), v.string()),
      earlier: v.array(
        v.object({
          at: v.number(),
          shows: v.string(),
          url: v.union(v.null(), v.string()),
        }),
      ),
    }),
  ),
  handler: async (ctx, { proofId }) => {
    const proof = await ctx.db.get("proofs", proofId);
    if (!proof) return null;
    if (proof.status !== "checking") return null;
    const goal = await ctx.db.get("goals", proof.goalId);
    const url = await ctx.storage.getUrl(proof.storageId);
    const recent = await ctx.db
      .query("proofs")
      .withIndex("by_goal", (q) => q.eq("goalId", proof.goalId))
      .order("desc")
      .take(20);
    const earlier = await Promise.all(
      recent
        .filter(
          (p) =>
            p._id !== proofId &&
            (p.status === "logged" || p.status === "unclear") &&
            p.isAttempt &&
            p._creationTime < proof._creationTime,
        )
        .slice(0, 3)
        .map(async (p) => ({
          at: p._creationTime,
          shows: p.shows ?? "",
          url: await ctx.storage.getUrl(p.storageId),
        })),
    );
    return { proof, goal, url, earlier };
  },
});

export const saveProof = internalMutation({
  args: {
    proofId: v.id("proofs"),
    status: v.union(
      v.literal("logged"),
      v.literal("unclear"),
      v.literal("failed"),
    ),
    shows: v.optional(v.string()),
    progress: v.optional(v.string()),
    note: v.optional(v.string()),
    isAttempt: v.optional(v.boolean()),
    feedback: v.optional(
      v.object({ better: v.string(), still: v.string(), next: v.string() }),
    ),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { proofId, ...fields }) => {
    const proof = await ctx.db.get("proofs", proofId);
    if (!proof) return null;
    if (proof.status !== "checking") return null;
    await ctx.db.patch("proofs", proofId, fields);
    if (fields.status !== "logged") return null;
    if (proof.practiceId) {
      const step = await ctx.db.get("practice", proof.practiceId);
      if (
        step &&
        proof.targetSnapshot === practiceTarget(step).targetSnapshot
      ) {
        await ctx.db.patch("practice", proof.practiceId, {
          doneAt: Date.now(),
        });
      } else {
        await ctx.db.patch("proofs", proofId, {
          note: `${fields.note ?? ""} Your practice step changed, so this photo was kept without checking off the new step.`.trim(),
        });
      }
    }
    if (proof.taskId) {
      const task = await ctx.db.get("tasks", proof.taskId);
      if (!task || proof.targetSnapshot !== taskTarget(task).targetSnapshot) {
        await ctx.db.patch("proofs", proofId, {
          note: `${fields.note ?? ""} Your step changed, so this photo was kept without checking off the new step.`.trim(),
        });
        return null;
      }
      await ctx.runMutation(api.tasks.setDone, {
        taskId: proof.taskId,
        done: true,
        today: proof.today,
      });
      const checkins = await ctx.db
        .query("checkins")
        .withIndex("by_goal", (q) => q.eq("goalId", proof.goalId))
        .order("desc")
        .take(30);
      const checkin = checkins.find(
        (c) => c.taskId === proof.taskId && c.kind === "done",
      );
      if (checkin)
        await ctx.db.patch("checkins", checkin._id, { note: fields.note });
    }
    return null;
  },
});
