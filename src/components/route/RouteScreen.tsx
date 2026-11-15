import { useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Button, Card, Chip, Screen, T, Thinking } from '@/components/goal-ui';
import GrandListScreen from './GrandListScreen';
import { useTheme } from '@/hooks/use-theme';
import { useToday } from '@/hooks/use-today';
import { DEVICE_ID } from '@/lib/plan';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { DEDICATION_LABEL, HOURS_PER_WEEK } from '../../../convex/routeEngine';

export default function RouteScreen() {
  const { routeId } = useLocalSearchParams<{ routeId?: string }>();
  const today = useToday();
  const theme = useTheme();
  const current = useQuery(api.route.current, routeId ? 'skip' : { deviceId: DEVICE_ID, today });
  const selected = useQuery(api.route.get, routeId ? { routeId: routeId as Id<'routes'>, today } : 'skip');
  const data = routeId ? selected : current;
  const activate = useMutation(api.route.activate);
  const advance = useMutation(api.route.advance);
  const retry = useMutation(api.route.retry);
  const setContext = useMutation(api.route.setCurrentContext);
  const [why, setWhy] = useState<string | null>(null);
  const [context, setContextText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<'now' | 'next' | 'later'>('now');
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setError(null); try { await fn(); } catch { setError('Couldn’t update your route. Your saved list is safe. Check your connection and retry.'); } finally { setBusy(false); } };
  const route = data?.route;
  const plan = data?.plan;
  if (data === null) return <GrandListScreen />;
  const toggle = (key: string) => setWhy(old => old === key ? null : key);
  const currentGoals = plan?.goals.filter(g => g.season === 'now').map(p => route?.goals.find(g => g.key === p.key)?.title).filter(Boolean) ?? [];
  return <Screen>
    <View style={{ gap: 8 }}><T size={12} weight="600" tone="textSecondary">THE BIG PICTURE</T><T size={36} weight="600">A way forward.</T><T size={17} tone="textSecondary">Everything has a place. Not everything is for today.</T></View>
    {!data ? <Thinking label="Finding your saved route" /> : null}
    {route?.sample ? <Card soft><T size={13} weight="600">SAMPLE ROUTE · not live AI output</T><T size={13}>This earlier example is illustrative. Map your own list for a real route.</T></Card> : null}
    {route?.careerContext ? <Card soft><T size={13} weight="600">PROVISIONAL CAREER ROUTE</T><T size={14}>Your background, target role and location shape this starting point. Entry requirements and recruiting dates still need current employer sources. No hiring date is promised.</T><T size={12} tone="textSecondary">After starting this season, open the goal’s cited Research panel. Unknown details stay unknown.</T></Card> : null}
    {route?.status === 'building' ? <Card soft><Thinking label={route.stage ?? 'Reading your list'} /><T size={14}>Your list is saved. We’re finding shared stops, then fitting them into your actual week.</T><T size={12} tone="textSecondary">This may take a couple of minutes. You can return here later.</T></Card> : null}
    {route?.status === 'failed' ? <Card><T size={22} weight="600">The map didn’t finish.</T><T tone="textSecondary">Your list is still here. Your current plan hasn’t changed.</T><Button busy={busy} label="Try mapping again" onPress={() => run(() => retry({ routeId: route._id }))} /></Card> : null}
    {route && plan && route.status === 'ready' ? <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><T size={32} weight="600">{route.weeklyHours ?? HOURS_PER_WEEK[route.dedication]}<T size={15}> h / week</T></T><T size={13} tone="textSecondary">{DEDICATION_LABEL[route.dedication]} dedication{'\n'}Shared across the whole route</T></View>
      {route.synergies.length ? <Card soft><T size={12} tone="accent" weight="700">ONE STOP. MORE THAN ONE GOAL.</T>{route.synergies.map(shared => <View key={shared.stopKey} style={{ gap: 7 }}><T size={23} weight="600">{route.stops.find(s => s.key === shared.stopKey)?.title}</T><T size={13} tone="accent">{shared.goalKeys.map(k => route.goals.find(g => g.key === k)?.title).join(' ↔ ')}</T><T size={14}>{shared.reason}</T></View>)}</Card> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>{(['now', 'next', 'later'] as const).map(value => <Chip key={value} label={value === 'now' ? 'This season' : value === 'next' ? 'Next' : 'Later'} selected={season === value} onPress={() => setSeason(value)} />)}</View>
      {plan.goals.filter(g => g.season === season).map(p => {
        const goal = route.goals.find(g => g.key === p.key)!;
        const stops = plan.stops.filter(s => route.stops.find(x => x.key === s.key)?.goalKeys.includes(goal.key));
        return <Card key={goal.key}>
          <T size={24} weight="600">{goal.title}</T>
          <T size={13} tone="textSecondary">{goal.horizon?.kind === 'byDate' ? `Date in mind: ${goal.horizon.date} · pace won’t be squeezed to fit` : goal.horizon?.kind === 'exploration' ? 'Room to explore, not a finish line' : goal.horizon?.kind === 'recurring' ? 'An ongoing rhythm' : 'A flexible horizon'}</T>
          {stops.slice(0, why === goal.key ? stops.length : 2).map((p, i) => { const stop = route.stops.find(s => s.key === p.key)!; return <View key={stop.key} style={{ flexDirection: 'row', gap: 14 }}><View style={{ width: 22, alignItems: 'center' }}><T tone="accent" weight="700">{p.season === 'done' ? '✓' : i === 0 ? '◉' : '○'}</T>{i < stops.length - 1 ? <View style={{ flex: 1, width: 2, minHeight: 22, backgroundColor: theme.border }} /> : null}</View><View style={{ flex: 1, gap: 4, paddingBottom: 12 }}><T size={16} weight="600">{stop.title}</T>{stop.goalKeys.length > 1 ? <T size={12} tone="accent">Shared stop · done once</T> : null}{i === 0 ? <T size={13} tone="textSecondary">{stop.why}</T> : null}</View></View>; })}
          {stops.length > 2 ? <Button small kind="ghost" label={why === goal.key ? 'Show less' : `See all ${stops.length} stops`} onPress={() => toggle(goal.key)} /> : null}
          {goal.goalId ? <Button small kind="quiet" label="Open ladder & research" onPress={() => router.push(`/goals/${goal.goalId}`)} /> : null}
        </Card>;
      })}
      {!plan.goals.some(g => g.season === season) ? <T tone="textSecondary">Nothing waiting here. Space opens as you reach your current stops.</T> : null}
      <Pressable accessibilityRole="button" onPress={() => toggle('order')}><T tone="accent" size={14}>Why this order?  {why === 'order' ? '−' : '+'}</T></Pressable>
      {why === 'order' ? <Card><T size={14}>Prerequisites first, then your weekly capacity. Shared stops get counted once. At most two goals ask for your attention together.</T><T size={13} tone="textSecondary">Effort is an AI planning assumption, not researched proof of how long your life will take. We don’t show a precise finish date.</T></Card> : null}
      {!route.activatedAt ? <Card><T size={12} tone="accent" weight="700">JUST FOR THIS SEASON</T><T size={21} weight="600">Where are you starting?</T><T size={14} tone="textSecondary">For {currentGoals.join(' + ')}: {currentGoals.some(t => /run|marathon|fitness/i.test(t ?? '')) ? 'what feels comfortable today, and any limits we should respect?' : 'what have you already tried, and what needs to fit around real life?'}</T><TextInput accessibilityLabel="Current season starting point" multiline maxLength={1600} value={context} onChangeText={setContextText} placeholder="A sentence is enough. Later goals can wait." placeholderTextColor={theme.textSecondary} style={{ minHeight: 100, fontSize: 17, lineHeight: 24, color: theme.text, textAlignVertical: 'top' }} /><Button busy={busy} label="Start with this season  →" onPress={() => run(async () => { await setContext({ routeId: route._id, context }); await activate({ routeId: route._id, today }); router.replace('/today'); })} /><T size={12} tone="textSecondary">This pauses your earlier unfinished plan. Completed work stays.</T></Card> : <><Button label="My small steps  →" onPress={() => router.replace('/today')} /><Button kind="quiet" busy={busy} label="Life changed. Reroute my next leg." onPress={() => run(() => advance({ routeId: route._id, today }))} /></>}
    </> : null}
    {error ? <T>{error}</T> : null}
    {route ? <><Pressable accessibilityRole="button" onPress={() => toggle('list')}><T size={14} tone="accent">Your whole original list  {why === 'list' ? '−' : '+'}</T></Pressable>{why === 'list' ? <Card><T size={15}>{route.input}</T></Card> : null}</> : null}
    <Button kind="ghost" label="Map a new list" onPress={() => router.push('/goals/grand-list')} />
  </Screen>;
}
