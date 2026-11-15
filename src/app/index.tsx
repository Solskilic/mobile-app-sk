import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button, Card, Ladder, Screen, T, Thinking } from '@/components/goal-ui';
import { TaskCard, type TaskView } from '@/components/task-card';
import { RouteStatus } from '@/components/route/RouteStatus';
import { Spacing } from '@/constants/theme';
import { useToday } from '@/hooks/use-today';
import { DEVICE_ID, formatDateKey, formatDay, nextDate } from '@/lib/plan';
import { api } from '../../convex/_generated/api';

export default function TodayScreen() {
  const today = useToday();
  const tomorrow = nextDate(today);
  const goals = useQuery(api.goals.list, { deviceId: DEVICE_ID });
  const upcoming = useQuery(api.tasks.upcoming, { deviceId: DEVICE_ID, today });
  const past = useQuery(api.tasks.past, { deviceId: DEVICE_ID, today });
  const ensureDemo = useMutation(api.seed.ensureDemo);
  const rollover = useMutation(api.tasks.rollover);
  const planThree = useMutation(api.tasks.plan);
  const lifeHappened = useMutation(api.tasks.lifeHappened);
  const planner = useQuery(api.tasks.planner, { deviceId: DEVICE_ID });
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    ensureDemo({ deviceId: DEVICE_ID, tomorrow }).then(() => rollover({ deviceId: DEVICE_ID, today }));
  }, [ensureDemo, rollover, today, tomorrow]);

  const active = goals?.filter((g) => g.status === 'active') ?? [];
  const pending = goals?.filter((g) => ['clarifying', 'planning', 'failed'].includes(g.status)) ?? [];
  const three = upcoming?.tasks ?? [];
  const isPlanning = !!planner?.running && three.length === 0;
  const planTomorrow = () => planThree({ deviceId: DEVICE_ID, forDate: tomorrow });
  const stripTitle = active.some((g) => g.routeId)
    ? upcoming?.forDate === today ? "Today's steps" : "Tomorrow's steps"
    : upcoming?.forDate === today ? "Today's three" : "Tomorrow's three";
  const openCount = three.filter((t) => t.status === 'open').length;

  return (
    <Screen>
      <View style={{ gap: Spacing.one }}>
        <T size={13} weight="700" tone="textSecondary">
          {formatDateKey(today).toUpperCase()}
        </T>
        <T size={34} weight="700">
          The big picture
        </T>
      </View>

      {goals === undefined ? <Thinking label="Loading your ladders" /> : null}
      <Button kind="quiet" label="Your route · see what comes first" onPress={() => router.push('/goals/route')} />

      {active.map((goal) => {
        const now = goal.rungs[goal.currentRung];
        const next = goal.rungs[goal.currentRung + 1];
        return (
          <Pressable key={goal._id} onPress={() => router.push(`/goals/${goal._id}`)}>
            <Card>
              <T size={20} weight="700">
                {goal.title}
              </T>
              <Ladder goal={goal} rungs={goal.rungs} />
              <View style={{ gap: 2 }}>
                <T size={15}>
                  <T size={15} weight="700">
                    Now:{' '}
                  </T>
                  {now?.title ?? '-'}
                  {next ? (
                    <T size={15} tone="textSecondary">
                      {'  ·  '}Next: {next.title}
                    </T>
                  ) : null}
                </T>
              {goal.projectedFinish && !goal.routeId ? (
                  <T size={15} tone="accent" weight="600">
                    At this pace: {formatDay(goal.projectedFinish)}
                    {goal.slipDays > 0 ? (
                      <T size={13} tone="textSecondary">
                        {'  '}(moved {goal.slipDays} {goal.slipDays === 1 ? 'day' : 'days'}, that&apos;s fine)
                      </T>
                    ) : null}
                  </T>
                ) : null}
              </View>
              {goal.coachNote ? (
                <Card soft>
                  <T size={14}>{goal.coachNote.text}</T>
                </Card>
              ) : null}
            </Card>
          </Pressable>
        );
      })}

      {pending.map((goal) => (
        <Pressable key={goal._id} onPress={() => router.push(`/goals/${goal._id}`)}>
          <Card>
            <T weight="700">{goal.title}</T>
            <T size={14} tone="textSecondary">
              {goal.status === 'failed' ? 'Planning hit a snag. Tap to retry.' : goal.status === 'clarifying' ? 'Waiting on 3 quick answers' : 'Building your ladder...'}
            </T>
          </Card>
        </Pressable>
      ))}

      {goals && active.length + pending.length < 3 ? (
        <Button
          kind="quiet"
          label={goals.length === 0 ? 'Add your first goal' : 'Add a goal'}
          onPress={() => router.push('/goals/new')}
        />
      ) : null}

      {active.length > 0 ? (
        <View style={{ gap: Spacing.three }}>
          <RouteStatus today={today} forDate={upcoming?.forDate ?? tomorrow} />
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <View>
              <T size={22} weight="700">
                {stripTitle}
              </T>
              {upcoming?.forDate ? (
                <T size={13} tone="textSecondary">
                  {formatDateKey(upcoming.forDate)} · picked across your goals
                </T>
              ) : null}
            </View>
            {upcoming?.forDate && openCount > 0 ? (
              <Button
                small
                kind="ghost"
                label="Life happened"
                onPress={() => lifeHappened({ deviceId: DEVICE_ID, forDate: upcoming.forDate! })}
              />
            ) : null}
          </View>
          {isPlanning ? <Thinking label="Picking three small steps" /> : null}
          {three.map((task: TaskView) => (
            <TaskCard key={task._id} task={task} today={today} />
          ))}
          {upcoming && three.length === 0 && !isPlanning ? (
            <Card>
              <T tone="textSecondary">
                {planner?.error
                  ? "Couldn't pick tomorrow's three just now. Try again in a moment."
                  : 'Nothing planned yet. Three small steps, picked for your current rungs.'}
              </T>
              <Button label={planner?.error ? 'Try again' : "Plan tomorrow's three"} onPress={planTomorrow} />
            </Card>
          ) : null}
          {upcoming?.forDate === today && openCount === 0 && three.length > 0 && !planner?.running ? (
            <Button kind="quiet" label="Plan tomorrow's three" onPress={planTomorrow} />
          ) : null}
        </View>
      ) : null}

      {past && past.length > 0 ? (
        <View style={{ gap: Spacing.three }}>
          <Button kind="ghost" small label={showPast ? 'Hide earlier days' : 'Earlier days (fix anything you did)'} onPress={() => setShowPast(!showPast)} />
          {showPast
            ? past.map((task: TaskView, i: number) => (
                <View key={task._id} style={{ gap: Spacing.two }}>
                  {i === 0 || past[i - 1].forDate !== task.forDate ? (
                    <T size={13} weight="700" tone="textSecondary">
                      {formatDateKey(task.forDate)}
                    </T>
                  ) : null}
                  <TaskCard task={task} today={today} past />
                </View>
              ))
            : null}
        </View>
      ) : null}
    </Screen>
  );
}
