import { useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import {
  BackLink,
  Button,
  Card,
  Screen,
  T,
  Thinking,
} from '@/components/goal-ui';
import { ProgressGallery } from '@/components/progress-gallery';
import { RunLog } from '@/components/run-log';
import { GoalGlyph, StepStrip } from '@/components/route-graphics';
import { useToday } from '@/hooks/use-today';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

export default function GoalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const goalId = id as Id<'goals'>;
  const goal = useQuery(api.goals.get, { goalId });
  const climb = useMutation(api.goals.climb);
  const advance = useMutation(api.route.advance);
  const today = useToday();
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (goal === undefined)
    return (
      <Screen>
        <Thinking label="Loading goal" />
      </Screen>
    );
  if (!goal)
    return (
      <Screen>
        <BackLink onPress={back} />
        <T>This goal is no longer here.</T>
      </Screen>
    );
  const current = goal.rungs.find((r) => r.index === goal.currentRung);
  return (
    <Screen>
      <BackLink onPress={back} />
      <View style={{ gap: 12 }}>
        <GoalGlyph name={goal.title} size={62} />
        <T size={12} tone="textSecondary" weight="600">
          {goal.status === 'done'
            ? 'COMPLETED GOAL'
            : goal.status === 'paused'
              ? 'LATER GOAL'
              : 'ACTIVE GOAL'}
        </T>
        <T size={34} weight="600">
          {goal.title}
        </T>
        <StepStrip
          total={goal.rungs.length}
          current={goal.currentRung}
          completed
        />
        <T size={12} tone="textSecondary">
          {goal.rungs.filter((r) => r.completedAt).length} of{' '}
          {goal.rungs.length} stops completed
        </T>
      </View>
      {notice ? (
        <Card soft>
          <T>{notice}</T>
        </Card>
      ) : null}
      {current && goal.status !== 'done' ? (
        <Card soft>
          <T size={12} tone="accent" weight="700">
            YOUR NEXT STOP
          </T>
          <T size={25} weight="600">
            {current.title}
          </T>
          <T size={15}>{current.milestone}</T>
          {goal.status === 'active' ? (
            <Button
              label="Mark stop complete"
              busy={busy}
              onPress={async () => {
                setBusy(true);
                try {
                  const win = await climb({ goalId, today });
                  setNotice(
                    win
                      ? `Completed: ${current.title}.${win.next ? ` Next: ${win.next}` : ''}`
                      : 'This stop is waiting for a prerequisite on your route.',
                  );
                } catch {
                  setNotice(
                    'Couldn’t save that check-in. Reconnect and try again.',
                  );
                } finally {
                  setBusy(false);
                }
              }}
            />
          ) : (
            <T size={13}>
              Complete the route prerequisites to activate this goal.
            </T>
          )}
        </Card>
      ) : null}
      {goal.coachNote ? (
        <Card soft>
          <T size={14}>{goal.coachNote.text}</T>
        </Card>
      ) : null}
      {/run|marathon|jog|5k|10k/i.test(goal.title) ? (
        <>
          <RunLog goalId={goalId} />
          {goal.routeId && goal.status === 'active' ? (
            <Button
              kind="quiet"
              busy={busy}
              label="Regenerate steps using run logs"
              onPress={async () => {
                setBusy(true);
                try {
                  await advance({ routeId: goal.routeId!, today });
                  setNotice(
                    'Next steps are being generated using your run logs. Milestones are unchanged.',
                  );
                } catch {
                  setNotice(
                    'Couldn’t update the next steps. Your saved runs are safe.',
                  );
                } finally {
                  setBusy(false);
                }
              }}
            />
          ) : null}
        </>
      ) : null}
      <Button
        kind="quiet"
        label="Research & sources  ↗"
        onPress={() => router.push(`/goals/research/${goalId}`)}
      />
      <T size={13} tone="textSecondary">
        Career requirements and learning resources.
      </T>
      <ProgressGallery goalId={goalId} />
      <Button
        kind="ghost"
        label={
          all
            ? 'Close the full ladder'
            : `Your full ladder · ${goal.rungs.length} stops`
        }
        onPress={() => setAll(!all)}
      />
      {all
        ? goal.rungs.map((rung) => (
            <View key={rung._id} style={{ flexDirection: 'row', gap: 14 }}>
              <T size={18} tone="accent">
                {rung.completedAt
                  ? '✓'
                  : rung.index === goal.currentRung
                    ? '◉'
                    : '○'}
              </T>
              <View style={{ flex: 1, gap: 5 }}>
                <T size={18} weight="600">
                  {rung.title}
                </T>
                <T size={14} tone="textSecondary">
                  {rung.milestone}
                </T>
              </View>
            </View>
          ))
        : null}
      <Button
        kind="quiet"
        label="Back to goals"
        onPress={() => router.replace('/')}
      />
      <T size={12} tone="textSecondary">
        Effort estimates are provisional.
      </T>
    </Screen>
  );
}
