import assert from "node:assert/strict";
import { test } from "vitest";
import { buildAdherenceContext } from "../convex/routeAdherence.ts";

const task = (forDate, status = "missed", minutes = 30, deviceId = "a") => ({ forDate, status, minutes, deviceId });
const missed = [task("2026-11-12"), task("2026-11-13", "open")];
const build = (tasks = missed, ramp = null, today = "2026-11-15", forDate = today) => buildAdherenceContext(tasks, ramp, today, forDate);

test("past open tasks count as missed; today and future tasks do not affect the model", () => {
  const result = build([...missed, task("2026-11-15", "done"), task("2026-11-16", "missed")]);
  assert.equal(result.model.resolved, 2);
  assert.equal(result.model.missedDaysInRow, 2);
  assert.equal(result.summary.minutesCap, 10);
  assert.equal(result.model.state, "drifting");
});

test("idle calendar days include unscheduled gaps, including when nothing was ever done", () => {
  for (const status of ["done", "missed"]) {
    const result = build([task("2026-11-01", status)]);
    assert.equal(result.model.idleDays, 13);
    assert.equal(result.model.state, "lapsed");
    assert.ok(result.newRamp);
  }
  assert.equal(build([]).newRamp, null);
  assert.equal(build([task("2026-11-14")]).newRamp, null);
});

test("missed days are counted once across goals and a completed day breaks the streak", () => {
  assert.equal(build([task("2026-11-14"), task("2026-11-14")]).model.missedDaysInRow, 1);
  const result = build([...missed, task("2026-11-14", "done")]);
  assert.equal(result.model.missedDaysInRow, 0);
  assert.equal(result.newRamp, null);
});

test("a persisted restart has fixed 10, 15, 20 ceilings and does not roll forward", () => {
  const ramp = build().newRamp;
  const easyHistory = [task("2026-11-14", "done")];
  for (const [date, day, ceiling] of [["2026-11-15", 1, 10], ["2026-11-16", 2, 15], ["2026-11-17", 3, 20]]) {
    const result = build(easyHistory, ramp, date, date);
    assert.equal(result.newRamp, null);
    assert.equal(result.summary.rampDay, day);
    assert.equal(result.summary.minutesCap, ceiling);
    assert.equal(result.summary.ramp.startDate, "2026-11-15");
  }
  assert.equal(build(easyHistory, ramp, "2026-11-18").summary.rampDay, null);
});

test("tomorrow generation starts day one on the target date, including month/year boundaries", () => {
  const result = build(missed, null, "2026-12-31", "2027-01-01");
  assert.equal(result.newRamp.startDate, "2027-01-01");
  assert.equal(result.newRamp.endDate, "2027-01-03");
  assert.equal(result.summary.minutesCap, 10);
});

test("old missed outcomes and idle time cannot restart an expired episode", () => {
  const ramp = build().newRamp;
  assert.equal(build(missed, ramp, "2026-11-25").newRamp, null);
  assert.equal(build([...missed, task("2026-11-17")], ramp, "2026-11-25").newRamp, null);
  const result = build([...missed, task("2026-11-18")], ramp, "2026-11-19");
  assert.equal(result.newRamp.startDate, "2026-11-19");
  assert.equal(result.newRamp.endDate, "2026-11-21");
});

test("weekday sizing and short-session evidence can lower but never raise restart ceilings", () => {
  const tasks = ["2026-11-02", "2026-11-09"].flatMap((date) => [task(date), task(date)]);
  tasks.push(...["2026-11-03", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"].map((date) => task(date, "done")));
  const result = build(tasks, null, "2026-11-15", "2026-11-16");
  assert.ok(result.model.weakDays.includes(1));
  assert.equal(result.summary.minutesCap, 15);
  assert.match(result.summary.explanation, /Mondays/);
  const shortWins = build([
    ...["2026-11-10", "2026-11-11", "2026-11-12"].map((date) => task(date, "done", 10)),
    ...["2026-11-13", "2026-11-14"].map((date) => task(date)),
  ]);
  assert.equal(shortWins.model.shortBeatsLong, true);
  assert.equal(shortWins.summary.minutesCap, 10);
});
