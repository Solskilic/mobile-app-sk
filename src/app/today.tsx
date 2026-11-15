import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Screen, T, Thinking } from '@/components/goal-ui';
import { TaskCard } from '@/components/task-card';
import { RouteStatus } from '@/components/route/RouteStatus';
import { useToday } from '@/hooks/use-today';
import { DEVICE_ID, formatDateKey } from '@/lib/plan';
import { api } from '../../convex/_generated/api';

export default function TodayScreen() {
  const today = useToday();
  const upcoming = useQuery(api.tasks.upcoming, { deviceId: DEVICE_ID, today });
  const past = useQuery(api.tasks.past, { deviceId: DEVICE_ID, today });
  const planner = useQuery(api.tasks.planner, { deviceId: DEVICE_ID });
  const route = useQuery(api.route.current, { deviceId: DEVICE_ID, today });
  const rollover = useMutation(api.tasks.rollover);
  const plan = useMutation(api.tasks.plan);
  const lifeHappened = useMutation(api.tasks.lifeHappened);
  const [history, setHistory] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { rollover({ deviceId: DEVICE_ID, today }).catch(() => setError('Couldn’t sync today. Check your connection.')); }, [rollover, today]);
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setError(''); try { await fn(); } catch { setError('That didn’t save. Check your connection and try again.'); } finally { setBusy(false); } };
  const tasks = upcoming?.tasks ?? [];
  const forDate = upcoming?.forDate ?? today;
  return <Screen>
    <View style={{ gap: 8 }}><T size={12} tone="textSecondary" weight="600">{formatDateKey(forDate).toUpperCase()}</T><T size={36} weight="600">{forDate === today ? 'A little closer.' : 'A little room for tomorrow.'}</T><T tone="textSecondary" size={17}>A few small steps. Then get on with your life.</T></View>
    {route?.route.activatedAt ? <RouteStatus today={today} forDate={forDate} /> : null}
    {!upcoming ? <Thinking label="Finding your small steps" /> : null}
    {planner?.running ? <Thinking label="Making room for your next steps" /> : null}
    {tasks.slice(0, 3).map(task => <TaskCard key={task._id} task={task} today={today} />)}
    {route?.route.activatedAt && !tasks.length && !planner?.running ? <Card><T size={20} weight="600">{planner?.error ? 'The next steps didn’t finish.' : 'Make a little room for today.'}</T><T size={14} tone="textSecondary">{planner?.error ? 'Your route is safe. Try again when you’re connected.' : 'We’ll choose at most three, inside your weekly hours.'}</T><Button busy={busy} label="Choose my small steps" onPress={() => run(() => plan({ deviceId: DEVICE_ID, forDate: today, today }))} /></Card> : null}
    {tasks.some(t => t.status === 'open') ? <Button kind="ghost" busy={busy} label="Life happened. Make room again." onPress={() => run(() => lifeHappened({ deviceId: DEVICE_ID, forDate, today }))} /> : null}
    {route && !route.route.activatedAt ? <Card><T>Your route is waiting. Choose a season before adding steps.</T><Button label="Back to my route" onPress={() => router.replace('/')} /></Card> : null}
    {!route && route !== undefined ? <Button label="Start with what you want to change" onPress={() => router.replace('/')} /> : null}
    {error ? <T>{error}</T> : null}
    {past?.length ? <><Button kind="ghost" label={history ? 'Close earlier days' : 'Earlier days · no catching up required'} onPress={() => setHistory(!history)} />{history ? past.map(task => <TaskCard key={task._id} task={task} today={today} past />) : null}</> : null}
  </Screen>;
}
