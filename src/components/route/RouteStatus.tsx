import { useQuery } from "convex/react";
import { useState } from "react";
import { Pressable } from "react-native";
import { Card, T } from "@/components/goal-ui";
import { DEVICE_ID } from "@/lib/plan";
import { api } from "../../../convex/_generated/api";

export function RouteStatus({ today, forDate }: { today: string; forDate: string }) {
  const context = useQuery(api.routeAdherence.context, { deviceId: DEVICE_ID, today, forDate });
  const [why, setWhy] = useState(false);
  if (!context) return null;
  return <Card soft>
    <T weight="600">{context.ramp ? "A gentler way back" : "At your pace"}</T>
    <T size={14}>{context.explanation}</T>
    {context.activityNote ? <T size={13} tone="textSecondary">{context.activityNote}</T> : null}
    <Pressable accessibilityRole="button" onPress={() => setWhy(!why)}>
      <T size={13} tone="accent">Why these steps?</T>
    </Pressable>
    {why ? <T size={13} tone="textSecondary">{context.ramp?.reason ?? "Your recent check-ins tell us which days and session sizes have been easier to finish. We keep uncertain patterns gentle and leave room for life."}</T> : null}
  </Card>;
}
