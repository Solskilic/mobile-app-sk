import { useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { BackLink, Button, Card, Celebration, Ladder, Screen, SmartCard, T, Thinking, VerdictCard } from '@/components/goal-ui';
import { Spacing } from '@/constants/theme';
import { formatDay, localDate } from '@/lib/plan';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

type Win = { kind: 'rung' | 'goal'; identity: string; next: string | null };

export default function GoalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const goalId = id as Id<'goals'>;
  const goal = useQuery(api.goals.get, { goalId });
  const climb = useMutation(api.goals.climb);
  const pause = useMutation(api.goals.pause);
  const resume = useMutation(api.goals.resume);
  const remove = useMutation(api.goals.remove);
  const retry = useMutation(api.goals.retry);
  const research = useMutation(api.goals.research);
  const [win, setWin] = useState<Win | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/goals'));

  if (goal === undefined) {
    return (
      <Screen>
        <Thinking label="Loading" />
      </Screen>
    );
  }
  if (goal === null) {
    return (
      <Screen>
        <BackLink onPress={back} />
        <T>This goal is gone.</T>
      </Screen>
    );
  }

  const current = goal.rungs[goal.currentRung];

  return (
    <Screen>
      <BackLink onPress={back} />
      <View style={{ gap: Spacing.one }}>
        <T size={13} weight="700" tone="textSecondary">
          YOU SAID: “{goal.text}”
        </T>
        <T size={30} weight="700">
          {goal.title}
        </T>
        {goal.status === 'paused' ? <T tone="textSecondary">Paused. Nothing is piling up while it rests.</T> : null}
      </View>

      {goal.status === 'clarifying' ? (
        <Card>
          <T>Three quick questions are waiting.</T>
          <Button label="Answer them" onPress={() => router.replace(`/goals/new?goalId=${goal._id}`)} />
        </Card>
      ) : null}
      {goal.status === 'planning' ? <Thinking label="Checking how realistic this is and building your ladder" /> : null}
      {goal.status === 'failed' ? (
        <Card>
          <T weight="700">Planning hit a snag.</T>
          <T size={13} tone="textSecondary">{goal.error}</T>
          <Button label="Try again" onPress={() => retry({ goalId, tomorrow: localDate(1) })} />
        </Card>
      ) : null}

      {goal.verdict ? <VerdictCard verdict={goal.verdict} /> : null}

      {goal.rungs.length > 0 ? (
        <Card>
          <T size={12} weight="700" tone="textSecondary">
            YOUR LADDER
          </T>
          <Ladder goal={goal} rungs={goal.rungs} large />
          <View style={{ gap: 2 }}>
            {goal.estimateLabel ? <T weight="600">{goal.estimateLabel}</T> : null}
            {goal.projectedFinish && !goal.routeId && goal.status !== 'done' ? (
              <T tone="accent" weight="600">
                At this pace: {formatDay(goal.projectedFinish)}
              </T>
            ) : null}
          </View>
          <View style={{ gap: Spacing.two }}>
            {goal.rungs.map((rung, i) => (
              <View key={rung._id} style={{ flexDirection: 'row', gap: Spacing.two }}>
                <T weight="700" tone={i < goal.currentRung ? 'accent' : 'textSecondary'}>
                  {i < goal.currentRung || goal.status === 'done' ? '✓' : `${i + 1}`}
                </T>
                <View style={{ flex: 1 }}>
                  <T weight="600">
                    {rung.title}
                    {rung.kind === 'explore' ? <T size={13} tone="textSecondary">  · exploration</T> : null}
                  </T>
                  <T size={14} tone="textSecondary">
                    {rung.identity} · {rung.milestone}
                  </T>
                </View>
              </View>
            ))}
          </View>
          {goal.status === 'active' && current ? (
            <Button
              label={`I've reached: ${current.title}`}
              onPress={async () => setWin(await climb({ goalId }))}
            />
          ) : null}
        </Card>
      ) : null}

      {goal.coachNote ? (
        <Card soft>
          <T size={12} weight="700" tone="accent">
            WE LIGHTENED NEXT WEEK
          </T>
          <T>{goal.coachNote.text}</T>
        </Card>
      ) : null}

      {goal.smart ? <SmartCard smart={goal.smart} /> : null}

      {goal.rungs.length > 0 ? (
        <Card>
          <T size={12} weight="700" tone="textSecondary">
            WHAT&apos;S AVAILABLE
          </T>
          <T size={13} tone="textSecondary">
            AI suggestions, not endorsements. Check details before you sign up.
          </T>
          {goal.resources?.map((r) => (
            <Pressable
              key={r.name}
              disabled={!r.url}
              onPress={() => WebBrowser.openBrowserAsync(r.url)}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, gap: 2 })}>
              <T weight="600" tone={r.url ? 'accent' : 'text'}>
                {r.name}
                <T size={12} tone="textSecondary">{'  '}{r.type}</T>
              </T>
              <T size={14} tone="textSecondary">
                {r.why}
              </T>
            </Pressable>
          ))}
          <Button
            kind="quiet"
            busy={goal.researching}
            label={goal.resources ? 'Refresh suggestions' : 'Show courses, communities & apps'}
            onPress={() => research({ goalId })}
          />
        </Card>
      ) : null}

      {notice ? <T tone="textSecondary">{notice}</T> : null}
      <View style={{ flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' }}>
        {goal.status === 'active' ? <Button kind="quiet" small label="Pause goal" onPress={() => pause({ goalId })} /> : null}
        {goal.status === 'paused' ? (
          <Button
            kind="quiet"
            small
            label="Resume goal"
            onPress={async () => {
              const result = await resume({ goalId });
              if (result === 'route') router.push({ pathname: '/goals/route', params: { routeId: goal.routeId } });
              setNotice(result === 'limit' ? 'You have 3 goals in motion. Pause one first.' : null);
            }}
          />
        ) : null}
        <Button
          kind="ghost"
          small
          label="Delete goal"
          onPress={async () => {
            await remove({ goalId });
            router.replace('/goals');
          }}
        />
      </View>
      <Celebration win={win} onClose={() => setWin(null)} />
    </Screen>
  );
}
