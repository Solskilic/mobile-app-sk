import { useMutation, useQuery } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { BackLink, Button, Card, Chip, Screen, T, Thinking } from "@/components/goal-ui";
import { useToday } from "@/hooks/use-today";
import { DEVICE_ID } from "@/lib/plan";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { DEMO_GOALS, DEMO_INPUT, DEMO_STOPS } from "../../../convex/routeSample";
import { DEDICATION_LABEL, HOURS_PER_WEEK, schedule } from "../../../convex/routeEngine";

const SAMPLE: Doc<"routes"> = {
  _id: "sample" as Id<"routes">, _creationTime: 0, deviceId: DEVICE_ID,
  input: DEMO_INPUT, dedication: "steady" as const, status: "ready" as const, startDate: "2026-11-15",
  goals: DEMO_GOALS, stops: DEMO_STOPS, sample: true,
  synergies: [
    { stopKey: "club", goalKeys: ["run", "friends"], reason: "Easy miles, familiar faces" },
    { stopKey: "sketch", goalKeys: ["ux", "art"], reason: "Draw your way into design" },
  ], merges: [],
};
const SAMPLE_PLAN = schedule({ goals: DEMO_GOALS, stops: DEMO_STOPS.map((s) => ({ ...s, done: false })), hoursPerWeek: 6, pace: 1 });

export default function RouteScreen() {
  const { routeId, preview } = useLocalSearchParams<{ routeId?: string; preview?: string }>();
  const isPreview = preview === "1";
  const today = useToday();
  const current = useQuery(api.route.current, isPreview || routeId ? "skip" : { deviceId: DEVICE_ID, today });
  const selected = useQuery(api.route.get, isPreview || !routeId ? "skip" : { routeId: routeId as Id<"routes">, today });
  const data = isPreview ? { route: SAMPLE, plan: SAMPLE_PLAN } : routeId ? selected : current;
  const ensure = useMutation(api.routeDemo.ensure);
  const activate = useMutation(api.route.activate);
  const advance = useMutation(api.route.advance);
  const retry = useMutation(api.route.retry);
  const setDedication = useMutation(api.route.setDedication);
  const [why, setWhy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<"now" | "next" | "later">("now");

  useEffect(() => {
    if (!isPreview && !routeId && current === null) ensure({ deviceId: DEVICE_ID, today }).catch(() => setError("Couldn't load a sample route. Try again."));
  }, [current, ensure, isPreview, routeId, today]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch { setError("Couldn't update the route. Please try again."); }
    finally { setBusy(false); }
  };
  const toggle = (key: string) => setWhy((v) => v === key ? null : key);
  const route = data?.route;
  const plan = data?.plan;
  return <Screen>
    <BackLink onPress={() => router.canGoBack() ? router.back() : router.replace("/goals")} />
    <View style={{ gap: 6 }}>
      <T size={30} weight="700">Your route</T>
      <T tone="textSecondary">Room for everything. Not everything at once.</T>
    </View>
    {!data ? <Thinking label="Loading your route" /> : null}
    {route?.status === "building" ? <Thinking label={route.stage ?? "Mapping your goals"} /> : null}
    {route?.status === "failed" ? <Card>
      <T weight="700">We couldn’t finish the map.</T>
      <T tone="textSecondary">Your list is saved. Nothing in your current plan changed.</T>
      <Button busy={busy} label="Try again" onPress={() => run(() => retry({ routeId: route._id }))} />
    </Card> : null}
    {route && plan && route.status === "ready" ? <>
      {route.sample ? <T size={13} tone="textSecondary">SAMPLE ROUTE · Illustrative stops, not a generated forecast.</T> : null}
      <Card>
        <T weight="700">{DEDICATION_LABEL[route.dedication]} · {HOURS_PER_WEEK[route.dedication]} hours a week</T>
        <T size={14}>Shared across your goals. At most two routes ask for your attention at once.</T>
        <Pressable accessibilityRole="button" onPress={() => toggle("schedule")}><T tone="accent" size={14}>Why this order?</T></Pressable>
        {why === "schedule" ? <T size={14} tone="textSecondary">Prerequisites come first. Then the scheduler fits each stop inside your weekly hours, gives shared stops one place, and leaves the rest for another season. A shared stop can help a future goal before you focus on it.</T> : null}
        {!isPreview ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {(["casual", "steady", "allIn"] as const).map((d) =>
            <Chip key={d} label={DEDICATION_LABEL[d]} selected={route.dedication === d}
              onPress={() => run(() => setDedication({ routeId: route._id, dedication: d }))} />)}
        </View> : null}
      </Card>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["now", "next", "later"] as const).map((s) => <Chip key={s} label={s === "now" ? "This season" : s === "next" ? "Next" : "Later"} selected={season === s} onPress={() => setSeason(s)} />)}
      </View>
      {plan.goals.filter((g) => g.season === season).map((p) => {
        const g = route.goals.find((x) => x.key === p.key)!;
        const stops = plan.stops.filter((s) => route.stops.find((x) => x.key === s.key)?.goalKeys.includes(g.key));
        return <Card key={g.key}>
          <T size={21} weight="700">{g.title}</T>
          <T size={14} tone="textSecondary">{g.summary}</T>
          <T size={13} tone="accent">{p.startWeek === 0 ? "Starts with this season" : "Waits for room in your week"}</T>
          {stops.map((p, i) => {
            const s = route.stops.find((x) => x.key === p.key)!;
            const otherGoals = s.goalKeys.filter((k) => k !== g.key).map((k) => route.goals.find((x) => x.key === k)?.title).filter(Boolean);
            return <View key={s.key} style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ alignItems: "center", width: 18 }}>
                <T tone="accent">{p.season === "done" ? "✓" : "○"}</T>
                {i < stops.length - 1 ? <View style={{ width: 1, minHeight: 30, flex: 1, backgroundColor: "#8EAA9D" }} /> : null}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={s.title + ". Why this stop?"}
                style={{ flex: 1, gap: 5, paddingBottom: 15 }} onPress={() => toggle(g.key + s.key)}>
                <T size={16} weight="600">{s.title}</T>
                {otherGoals.length ? <T size={12} tone="accent">↔ Also serves {otherGoals.join(" + ")}</T> : null}
                <T size={12} tone="textSecondary">Why this stop?</T>
                {why === g.key + s.key ? <View style={{ gap: 5 }}>
                  <T size={14}>{s.why}</T>
                  <T size={13} tone="textSecondary">{s.milestone}</T>
                  {s.dependsOn.length ? <T size={12} tone="textSecondary">After: {s.dependsOn.map((k) => route.stops.find((x) => x.key === k)?.title).filter(Boolean).join(" · ")}</T> : null}
                </View> : null}
              </Pressable>
            </View>;
          })}
          {"goalId" in g && typeof g.goalId === "string" ? <Button kind="ghost" small label="Open this goal’s ladder" onPress={() => router.push(`/goals/${g.goalId}`)} /> : null}
        </Card>;
      })}
      {!plan.goals.some((g) => g.season === season) ? <T tone="textSecondary">No goals waiting here. The next season opens as you finish your current stops.</T> : null}
      {route.synergies.length ? <Card>
        <T size={18} weight="700">One stop, two directions</T>
        {route.synergies.map((s) => <View key={s.stopKey} style={{ gap: 3 }}>
          <T weight="600">{route.stops.find((x) => x.key === s.stopKey)?.title}</T>
          <T size={14} tone="accent">{s.goalKeys.map((k) => route.goals.find((g) => g.key === k)?.title).join(" ↔ ")}</T>
          <T size={13} tone="textSecondary">{s.reason}</T>
        </View>)}
      </Card> : null}
      <Card>
        <T weight="700">A working route, not a prediction</T>
        <T size={14} tone="textSecondary">Effort and duration are provisional planning assumptions, not researched evidence. Your weekly hours and check-ins change the order and pace. We won’t promise a finish date from an AI guess.</T>
        {"timelineWeeks" in route && typeof route.timelineWeeks === "number" ? <T size={14}>{plan.totalWeeks > route.timelineWeeks ? "This draft needs more room than your preferred timeline. Keep the pace, or choose a smaller first version." : "Your preferred timeline leaves room in this draft. We’ll revisit it as we learn your pace."}</T> : null}
      </Card>
      {!isPreview ? <Card>
        <T size={14} tone="textSecondary">{route.activatedAt ? "Refresh your next leg after reaching a stop or changing your pace. Your completed work stays." : "Using this route pauses your other unfinished goals and replaces their open steps. Nothing you completed is lost."}</T>
        <Button busy={busy} label={route.activatedAt ? "Reroute my next leg" : "Use this route"} onPress={() => run(() => route.activatedAt ? advance({ routeId: route._id, today }) : activate({ routeId: route._id, today }))} />
      </Card> : null}
    </> : null}
    {error ? <T>{error}</T> : null}
    <Button kind="quiet" label="Map a new grand list" onPress={() => router.push("/goals/grand-list")} />
  </Screen>;
}
