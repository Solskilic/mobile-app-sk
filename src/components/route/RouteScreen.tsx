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
import {
  FlowReveal,
  GoalGlyph,
  MotionGroup,
  RouteNetwork,
} from '@/components/route-graphics';

export default function RouteScreen() {
  const { routeId } = useLocalSearchParams<{ routeId?: string }>();
  const today = useToday();
  const theme = useTheme();
  const current = useQuery(api.route.current, { deviceId: DEVICE_ID, today });
  const selected = useQuery(
    api.route.get,
    routeId ? { routeId: routeId as Id<'routes'>, today } : 'skip',
  );
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
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch {
      setError('Couldn’t update the route. Check your connection and retry.');
    } finally {
      setBusy(false);
    }
  };
  const route = data?.route;
  const plan = data?.plan;
  if (data === null) return <GrandListScreen />;
  const toggle = (key: string) => setWhy((old) => (old === key ? null : key));
  const currentGoals =
    plan?.goals
      .filter((g) => g.season === 'now')
      .map((p) => route?.goals.find((g) => g.key === p.key)?.title)
      .filter(Boolean) ?? [];
  return (
    <Screen>
      <T size={36} weight="600">
        Your goals
      </T>
      {!data ? <Thinking label="Loading goals" /> : null}
      {route &&
      current?.route.activatedAt &&
      route._id !== current.route._id ? (
        <Button
          kind="quiet"
          label="Back to active route"
          onPress={() => router.replace('/')}
        />
      ) : null}
      {current?.draft && route?._id !== current.draft._id ? (
        <Button
          kind="quiet"
          label="Open saved draft"
          onPress={() =>
            router.push({
              pathname: '/goals/route',
              params: { routeId: current.draft!._id },
            })
          }
        />
      ) : null}
      {route?.sample ? (
        <Card soft>
          <T size={13} weight="600">
            SAMPLE ROUTE · not live AI output
          </T>
          <T size={13}>
            This earlier example is illustrative. Map your own list for a real
            route.
          </T>
        </Card>
      ) : null}
      {route?.careerContext ? (
        <Card soft>
          <T size={13} weight="600">
            PROVISIONAL CAREER ROUTE
          </T>
          <T size={14}>
            Your background, target role and location shape this starting point.
            Entry requirements and recruiting dates still need current employer
            sources. No hiring date is promised.
          </T>
          <T size={12} tone="textSecondary">
            After starting this season, open the goal’s cited Research panel.
            Unknown details stay unknown.
          </T>
        </Card>
      ) : null}
      {route?.status === 'building' ? (
        <Card soft>
          <Thinking label={route.stage ?? 'Reading your list'} />
          <T size={14}>Generating dependencies and shared steps.</T>
          <T size={12} tone="textSecondary">
            You can leave this screen; generation continues.
          </T>
        </Card>
      ) : null}
      {route?.status === 'failed' ? (
        <Card>
          <T size={22} weight="600">
            Route generation failed
          </T>
          <T tone="textSecondary">
            Your list is saved. The active route has not changed.
          </T>
          <Button
            busy={busy}
            label="Retry"
            onPress={() => run(() => retry({ routeId: route._id }))}
          />
        </Card>
      ) : null}
      {route && plan && route.status === 'ready' ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <T size={32} weight="600">
              {route.weeklyHours ?? HOURS_PER_WEEK[route.dedication]}
              <T size={15}> h / week</T>
            </T>
            <T size={13} tone="textSecondary">
              {route.demoProfile
                ? route.demoProfile.structure === 'routine'
                  ? 'Routine sessions'
                  : 'Flexible sessions'
                : `${DEDICATION_LABEL[route.dedication]} dedication`}
              {'\n'}Shared across the whole route
            </T>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['now', 'next', 'later'] as const).map((value) => (
              <Chip
                key={value}
                label={
                  value === 'now'
                    ? 'This season'
                    : value === 'next'
                      ? 'Next'
                      : 'Later'
                }
                selected={season === value}
                onPress={() => setSeason(value)}
              />
            ))}
          </View>
          <MotionGroup key={`${route._id}-${season}`}>
            {season === 'now' && route.synergies.length ? (
              <Card soft>
                <RouteNetwork
                  goals={route.goals.filter((g) =>
                    route.synergies[0].goalKeys.includes(g.key),
                  )}
                  sharedTitle={
                    route.stops.find(
                      (s) => s.key === route.synergies[0].stopKey,
                    )?.title ?? 'Shared step'
                  }
                />
                <Button
                  kind="ghost"
                  small
                  label="Connection details"
                  onPress={() => toggle('shared')}
                />
                <FlowReveal open={why === 'shared'}>
                  <View style={{ gap: 8 }}>
                    {route.synergies.map((s) => (
                      <T size={13} key={s.stopKey}>
                        {s.reason}
                      </T>
                    ))}
                  </View>
                </FlowReveal>
              </Card>
            ) : null}
            {plan.goals
              .filter((g) => g.season === season)
              .map((p) => {
                const goal = route.goals.find((g) => g.key === p.key)!;
                const stops = plan.stops.filter((s) =>
                  route.stops
                    .find((x) => x.key === s.key)
                    ?.goalKeys.includes(goal.key),
                );
                return (
                  <Card key={goal.key}>
                    <View
                      style={{
                        flexDirection: 'row',
                        gap: 12,
                        alignItems: 'center',
                      }}
                    >
                      <GoalGlyph name={goal.title} />
                      <T size={22} weight="600" style={{ flex: 1 }}>
                        {goal.title}
                      </T>
                    </View>
                    <T size={13} tone="textSecondary">
                      {goal.horizon?.kind === 'byDate'
                        ? `Target date: ${goal.horizon.date}`
                        : goal.horizon?.kind === 'exploration'
                          ? 'Exploration'
                          : goal.horizon?.kind === 'recurring'
                            ? 'Recurring'
                            : 'Flexible timing'}
                    </T>
                    <View>
                      {stops.map((stopPlan, i) => {
                        const stop = route.stops.find(
                          (s) => s.key === stopPlan.key,
                        )!;
                        return (
                          <FlowReveal
                            key={stop.key}
                            open={i < 2 || why === goal.key}
                          >
                            <View style={{ flexDirection: 'row', gap: 14 }}>
                              <View style={{ width: 22, alignItems: 'center' }}>
                                <T tone="accent" weight="700">
                                  {stopPlan.season === 'done'
                                    ? '✓'
                                    : i === 0
                                      ? '◉'
                                      : '○'}
                                </T>
                                {i < stops.length - 1 ? (
                                  <View
                                    style={{
                                      flex: 1,
                                      width: 2,
                                      minHeight: 22,
                                      backgroundColor: theme.border,
                                    }}
                                  />
                                ) : null}
                              </View>
                              <View
                                style={{ flex: 1, gap: 4, paddingBottom: 12 }}
                              >
                                <T size={16} weight="600">
                                  {stop.title}
                                </T>
                                {stop.goalKeys.length > 1 ? (
                                  <T size={12} tone="accent">
                                    Shared activity
                                  </T>
                                ) : null}
                                <FlowReveal open={why === goal.key}>
                                  <T size={13} tone="textSecondary">
                                    {stop.why}
                                  </T>
                                </FlowReveal>
                              </View>
                            </View>
                          </FlowReveal>
                        );
                      })}
                    </View>
                    {stops.length > 2 ? (
                      <Button
                        small
                        kind="ghost"
                        label={
                          why === goal.key
                            ? 'Show less'
                            : `See all ${stops.length} stops`
                        }
                        onPress={() => toggle(goal.key)}
                      />
                    ) : null}
                    {goal.goalId ? (
                      <Button
                        small
                        kind="quiet"
                        label="Open ladder & research"
                        onPress={() => router.push(`/goals/${goal.goalId}`)}
                      />
                    ) : null}
                  </Card>
                );
              })}
            {!plan.goals.some((g) => g.season === season) ? (
              <T tone="textSecondary">No goals in this season.</T>
            ) : null}
          </MotionGroup>
          <Pressable accessibilityRole="button" onPress={() => toggle('order')}>
            <T tone="accent" size={14}>
              Why this order? {why === 'order' ? '−' : '+'}
            </T>
          </Pressable>
          {why === 'order' ? (
            <Card>
              <T size={14}>
                Prerequisites first, then your weekly capacity. Shared stops get
                counted once. At most two goals ask for your attention together.
              </T>
              <T size={13} tone="textSecondary">
                Effort is an AI planning assumption, not researched proof of how
                long your life will take. We don’t show a precise finish date.
              </T>
            </Card>
          ) : null}
          {!route.activatedAt ? (
            <Card>
              {!route.profileContext ? (
                <>
                  {' '}
                  <T size={12} tone="accent" weight="700">
                    CURRENT-SEASON CONTEXT
                  </T>
                  <T size={21} weight="600">
                    Current experience
                  </T>
                  <T size={14} tone="textSecondary">
                    For {currentGoals.join(' + ')}:{' '}
                    {currentGoals.some((t) =>
                      /run|marathon|fitness/i.test(t ?? ''),
                    )
                      ? 'current running experience and any activity limits?'
                      : 'current experience and scheduling constraints?'}
                  </T>
                  <TextInput
                    accessibilityLabel="Current season starting point"
                    multiline
                    maxLength={1600}
                    value={context}
                    onChangeText={setContextText}
                    placeholder="Current experience or constraints"
                    placeholderTextColor={theme.textSecondary}
                    style={{
                      minHeight: 100,
                      fontSize: 17,
                      lineHeight: 24,
                      color: theme.text,
                      textAlignVertical: 'top',
                    }}
                  />
                </>
              ) : (
                <T size={13} tone="textSecondary">
                  Uses your fictional demo profile’s starting point, time and
                  preferences.
                </T>
              )}
              <Button
                busy={busy}
                label="Activate route  →"
                onPress={() =>
                  run(async () => {
                    await setContext({ routeId: route._id, context });
                    await activate({ routeId: route._id, today });
                    router.replace('/today');
                  })
                }
              />
              <T size={12} tone="textSecondary">
                This pauses your earlier unfinished plan. Completed work stays.
              </T>
            </Card>
          ) : (
            <>
              <Button
                label="Open Today  →"
                onPress={() => router.replace('/today')}
              />
              <Button
                kind="quiet"
                busy={busy}
                label="Update next steps"
                onPress={() =>
                  run(() => advance({ routeId: route._id, today }))
                }
              />
            </>
          )}
        </>
      ) : null}
      {error ? <T>{error}</T> : null}
      {route ? (
        <>
          <Pressable accessibilityRole="button" onPress={() => toggle('list')}>
            <T size={14} tone="accent">
              Your whole original list {why === 'list' ? '−' : '+'}
            </T>
          </Pressable>
          {why === 'list' ? (
            <Card>
              <T size={15}>{route.input}</T>
            </Card>
          ) : null}
        </>
      ) : null}
      <Button
        kind="ghost"
        label="Add a new goal list"
        onPress={() => router.push('/goals/grand-list')}
      />
    </Screen>
  );
}
