import { useQuery } from 'convex/react';
import { View } from 'react-native';

import { Card, Screen, T, Thinking } from '@/components/goal-ui';
import { Spacing } from '@/constants/theme';
import { DEVICE_ID, formatDay } from '@/lib/plan';
import { api } from '../../convex/_generated/api';

export default function CompletedWorkScreen() {
  const wins = useQuery(api.goals.wins, { deviceId: DEVICE_ID });
  return (
    <Screen>
      <View style={{ gap: Spacing.one }}>
        <T size={34} weight="700">
          Completed work
        </T>
      </View>
      {wins === undefined ? (
        <Thinking label="Loading" />
      ) : (
        <>
          <Card soft>
            <T size={40} weight="800" tone="accent">
              {wins.milestones.length}
            </T>
            <T weight="600">stops complete · {wins.tasksDone} tasks complete</T>
          </Card>
          {wins.milestones.length === 0 ? (
            <T tone="textSecondary">No completed stops.</T>
          ) : null}
          {wins.milestones.map((m) => (
            <Card key={m._id}>
              <T size={12} weight="700" tone="textSecondary">
                {(m.kind === 'goalDone' ? 'GOAL COMPLETE · ' : 'RUNG · ') +
                  formatDay(m.at).toUpperCase()}
              </T>
              <T size={20} weight="700">
                {m.goalTitle}
              </T>
              <T size={14} tone="textSecondary">
                {m.goalTitle}
              </T>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
