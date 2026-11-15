import { useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { BackLink, Button, Card, Screen, T, Thinking } from '@/components/goal-ui';
import { ProgressGallery } from '@/components/progress-gallery';
import { useToday } from '@/hooks/use-today';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

export default function GoalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const goalId = id as Id<'goals'>;
  const goal = useQuery(api.goals.get, { goalId });
  const climb = useMutation(api.goals.climb);
  const today = useToday();
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const back = () => router.canGoBack() ? router.back() : router.replace('/');
  if (goal === undefined) return <Screen><Thinking label="Opening your goal" /></Screen>;
  if (!goal) return <Screen><BackLink onPress={back} /><T>This goal is no longer here.</T></Screen>;
  const current = goal.rungs.find(r => r.index === goal.currentRung);
  return <Screen>
    <BackLink onPress={back} />
    <View style={{ gap: 8 }}><T size={12} tone="textSecondary" weight="600">{goal.status === 'done' ? 'A CHAPTER YOU FINISHED' : goal.status === 'paused' ? 'WAITING FOR ITS SEASON' : 'YOUR CURRENT CHAPTER'}</T><T size={34} weight="600">{goal.title}</T></View>
    {notice ? <Card soft><T>{notice}</T></Card> : null}
    {current && goal.status !== 'done' ? <Card soft><T size={12} tone="accent" weight="700">YOUR NEXT STOP</T><T size={25} weight="600">{current.title}</T><T size={15}>{current.milestone}</T><T size={12} tone="textSecondary">{current.kind === 'explore' ? 'A little exploration before a bigger commitment.' : 'Your check-in, not an automatic verdict.'}</T>{goal.status === 'active' ? <Button label="I’ve reached this stop" busy={busy} onPress={async () => { setBusy(true); try { const win = await climb({ goalId, today }); setNotice(win ? `${win.identity}${win.next ? ` Next: ${win.next}` : ''}` : 'This stop is waiting for a prerequisite on your route.'); } catch { setNotice('Couldn’t save that check-in. Reconnect and try again.'); } finally { setBusy(false); } }} /> : <T size={13}>Your route will make room for this goal when its prerequisites are ready.</T>}</Card> : null}
    {goal.coachNote ? <Card soft><T size={14}>{goal.coachNote.text}</T></Card> : null}
    <Button kind="quiet" label="Research with current sources  ↗" onPress={() => router.push(`/goals/research/${goalId}`)} />
    <T size={13} tone="textSecondary">Career requirements, learning resources, or communities. Sources stay dated; unknowns stay unknown.</T>
    <ProgressGallery goalId={goalId} />
    <Button kind="ghost" label={all ? 'Close the full ladder' : `Your full ladder · ${goal.rungs.length} stops`} onPress={() => setAll(!all)} />
    {all ? goal.rungs.map(rung => <View key={rung._id} style={{ flexDirection: 'row', gap: 14 }}><T size={18} tone="accent">{rung.completedAt ? '✓' : rung.index === goal.currentRung ? '◉' : '○'}</T><View style={{ flex: 1, gap: 5 }}><T size={18} weight="600">{rung.title}</T><T size={14} tone="textSecondary">{rung.milestone}</T></View></View>) : null}
    <Button kind="quiet" label="Back to the big picture" onPress={() => router.replace('/')} />
    <T size={12} tone="textSecondary">This route is a working plan, not a forecast. Revisit it when life changes.</T>
  </Screen>;
}
