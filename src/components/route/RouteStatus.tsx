import { useQuery } from 'convex/react';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { T } from '@/components/goal-ui';
import { DEVICE_ID } from '@/lib/plan';
import { api } from '../../../convex/_generated/api';

export function RouteStatus({
  today,
  forDate,
}: {
  today: string;
  forDate: string;
}) {
  const context = useQuery(api.routeAdherence.context, {
    deviceId: DEVICE_ID,
    today,
    forDate,
  });
  const [why, setWhy] = useState(false);
  if (!context) return null;
  return (
    <View style={{ gap: 8 }}>
      <Pressable accessibilityRole="button" onPress={() => setWhy(!why)}>
        <T size={13} tone="accent">
          {context.ramp
            ? `Re-entry · day ${context.rampDay} of 3`
            : 'Step limits'}{' '}
          · {context.minutesCap} min maximum {why ? '−' : '+'}
        </T>
      </Pressable>
      {why ? (
        <>
          <T size={13} tone="textSecondary">
            {context.explanation}
          </T>
          {context.activityNote ? (
            <T size={13} tone="textSecondary">
              {context.activityNote}
            </T>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
