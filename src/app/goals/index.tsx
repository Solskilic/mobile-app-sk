import { useQuery } from 'convex/react';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Button, Card, Ladder, Screen, T, Thinking } from '@/components/goal-ui';
import { Spacing } from '@/constants/theme';
import { DEVICE_ID } from '@/lib/plan';
import { api } from '../../../convex/_generated/api';

const LABEL: Record<string, string> = {
  clarifying: 'Setting up',
  planning: 'Planning',
  active: 'Climbing',
  paused: 'Paused',
  done: 'Done',
  failed: 'Needs a retry',
};

export default function GoalsScreen() {
  const goals = useQuery(api.goals.list, { deviceId: DEVICE_ID });
  const live = goals?.filter((g) => ['clarifying', 'planning', 'active', 'failed'].includes(g.status)).length ?? 0;
  return (
    <Screen>
      <View style={{ gap: Spacing.one }}>
        <T size={34} weight="700">
          Goals
        </T>
        <T tone="textSecondary">{live} of 3 in motion. Fewer goals, more finish lines.</T>
      </View>
      <Button label="Add a goal" onPress={() => router.push('/goals/new')} />
      {goals === undefined ? <Thinking label="Loading" /> : null}
      {goals?.map((goal) => (
        <Pressable key={goal._id} onPress={() => router.push(`/goals/${goal._id}`)}>
          <Card style={{ opacity: goal.status === 'paused' ? 0.7 : 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two }}>
              <T size={18} weight="700" style={{ flex: 1 }}>
                {goal.title}
              </T>
              <T size={13} weight="700" tone={goal.verdict?.level ?? 'textSecondary'}>
                {LABEL[goal.status]}
              </T>
            </View>
            {goal.rungs.length > 0 ? <Ladder goal={goal} rungs={goal.rungs} /> : null}
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
