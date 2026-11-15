import { useMutation } from "convex/react";
import { router } from "expo-router";
import { useState } from "react";
import { TextInput, View } from "react-native";
import { BackLink, Button, Card, Chip, Screen, T } from "@/components/goal-ui";
import { useTheme } from "@/hooks/use-theme";
import { useToday } from "@/hooks/use-today";
import { DEVICE_ID } from "@/lib/plan";
import { api } from "../../../convex/_generated/api";
import { DEDICATION_LABEL, HOURS_PER_WEEK, type Dedication } from "../../../convex/routeEngine";

export default function GrandListScreen() {
  const today = useToday();
  const theme = useTheme();
  const create = useMutation(api.route.create);
  const [input, setInput] = useState("");
  const [level, setLevel] = useState<Dedication>("steady");
  const [weeks, setWeeks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function build() {
    setError(null);
    const timelineWeeks = weeks.trim() ? Number(weeks) : undefined;
    if (timelineWeeks !== undefined && (!Number.isInteger(timelineWeeks) || timelineWeeks < 1 || timelineWeeks > 520)) {
      setError("Choose a timeline between 1 and 520 weeks, or leave it open.");
      return;
    }
    setBusy(true);
    try {
      const routeId = await create({ deviceId: DEVICE_ID, input, dedication: level, timelineWeeks, today });
      router.replace({ pathname: "/goals/route", params: { routeId } });
    } catch {
      setError("Couldn't start the route. Check your connection and try again.");
    } finally { setBusy(false); }
  }
  return <Screen>
    <BackLink onPress={() => router.canGoBack() ? router.back() : router.replace("/goals")} />
    <View style={{ gap: 8 }}>
      <T size={30} weight="700">Where do you want to go?</T>
      <T tone="textSecondary">One goal or everything on your mind. We’ll find the overlaps and choose what comes first.</T>
    </View>
    <Card>
      <T weight="700">Your grand list</T>
      <TextInput accessibilityLabel="Your grand list" multiline maxLength={6000} value={input} onChangeText={setInput}
        placeholder="Run a marathon, change careers, draw again, make friends in Seattle…"
        placeholderTextColor={theme.textSecondary}
        style={{ minHeight: 150, color: theme.text, fontSize: 17, lineHeight: 25, textAlignVertical: "top" }} />
      <T size={13} tone="textSecondary">Be abstract or specific. Add timing beside each goal if it matters: “marathon by October”, “read every week”, or “explore UX”. Related ideas become up to six goal families.</T>
    </Card>
    <Card>
      <T weight="700">How much room does this get?</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(["casual", "steady", "allIn"] as const).map((d) =>
          <Chip key={d} label={DEDICATION_LABEL[d]} selected={d === level} onPress={() => setLevel(d)} />)}
      </View>
      <T>{HOURS_PER_WEEK[level]} hours a week, shared across your whole list.</T>
      <T size={13} tone="textSecondary">Why we ask: your hours decide which goals travel together and which wait. Nothing gets squeezed to meet a deadline.</T>
    </Card>
    <Card>
      <T weight="700">An optional shared check-in</T>
      <TextInput accessibilityLabel="Timeline in weeks" keyboardType="number-pad" value={weeks} onChangeText={setWeeks}
        placeholder="Number of weeks, or leave it open" placeholderTextColor={theme.textSecondary}
        style={{ color: theme.text, paddingVertical: 12, fontSize: 16 }} />
      <T size={13} tone="textSecondary">This is a point to revisit the whole route, not a deadline for every goal. Individual horizons stay separate from your hours.</T>
    </Card>
    {error ? <T>{error}</T> : null}
    <Button label="Map my route" busy={busy} disabled={!input.trim()} onPress={build} />
  </Screen>;
}
