import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Screen, T, Thinking } from '@/components/goal-ui';
import { TaskCard } from '@/components/task-card';
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
  useEffect(() => {
    rollover({ deviceId: DEVICE_ID, today }).catch(() =>
      setError('Couldn’t sync today. Check your connection.'),
    );
  }, [rollover, today]);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch {
      setError('That didn’t save. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };
  const tasks = upcoming?.tasks ?? [];
  const forDate = upcoming?.forDate ?? today;
  return (
    <Screen>
      <View style={{ gap: 8 }}>
        <T size={12} tone="textSecondary" weight="600">
          {formatDateKey(forDate).toUpperCase()}
        </T>
        <T size={36} weight="600">
          {forDate === today ? 'Today' : 'Tomorrow'}
        </T>
        <T tone="textSecondary" size={17}>
          {tasks.filter((t) => t.status === 'open').length}{' '}
          {tasks.filter((t) => t.status === 'open').length === 1
            ? 'step'
            : 'steps'}{' '}
          ·{' '}
          {tasks
            .filter((t) => t.status === 'open')
            .reduce((sum, t) => sum + t.minutes, 0)}{' '}
          min
        </T>
      </View>
      {!upcoming ? <Thinking label="Loading steps" /> : null}
      {planner?.running ? <Thinking label="Generating steps" /> : null}
      {tasks.slice(0, 3).map((task) => (
        <TaskCard key={task._id} task={task} today={today} />
      ))}
      {route?.route.activatedAt && !tasks.length && !planner?.running ? (
        <Card>
          <T size={20} weight="600">
            {planner?.error ? 'Step generation failed' : 'No steps scheduled'}
          </T>
          <T size={14} tone="textSecondary">
            {planner?.error
              ? 'Retry when connected.'
              : 'Generate up to three steps within your weekly capacity.'}
          </T>
          <Button
            busy={busy}
            label="Generate steps"
            onPress={() =>
              run(() => plan({ deviceId: DEVICE_ID, forDate: today, today }))
            }
          />
        </Card>
      ) : null}
      {tasks.some((t) => t.status === 'open') ? (
        <Button
          kind="ghost"
          busy={busy}
          label="Skip remaining steps"
          onPress={() =>
            run(() => lifeHappened({ deviceId: DEVICE_ID, forDate, today }))
          }
        />
      ) : null}
      {route && !route.route.activatedAt ? (
        <Card>
          <T>Activate a route before generating steps.</T>
          <Button label="Open route" onPress={() => router.replace('/')} />
        </Card>
      ) : null}
      {!route && route !== undefined ? (
        <Button label="Add goals" onPress={() => router.replace('/')} />
      ) : null}
      {error ? <T>{error}</T> : null}
      {past?.length ? (
        <>
          <Button
            kind="ghost"
            label={history ? 'Close earlier days' : 'Earlier check-ins'}
            onPress={() => setHistory(!history)}
          />
          {history
            ? past.map((task) => (
                <TaskCard key={task._id} task={task} today={today} past />
              ))
            : null}
        </>
      ) : null}
    </Screen>
  );
}
