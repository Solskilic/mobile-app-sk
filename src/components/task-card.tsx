import { useAction, useMutation } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  ReduceMotion,
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { FlowReveal } from './route-graphics';

import { Button, Card, T } from '@/components/goal-ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '../../convex/_generated/api';
import type { Doc } from '../../convex/_generated/dataModel';

export type TaskView = Doc<'tasks'> & { goalTitle: string; rungTitle: string };

export function TaskCard({
  task,
  today,
  past,
}: {
  task: TaskView;
  today: string;
  past?: boolean;
}) {
  const theme = useTheme();
  const setDone = useMutation(api.tasks.setDone);
  const miss = useMutation(api.tasks.miss);
  const swap = useAction(api.ai.swap);
  const shrink = useAction(api.ai.shrink);
  const [busy, setBusy] = useState<'swap' | 'shrink' | null>(null);
  const [why, setWhy] = useState(false);
  const [error, setError] = useState('');
  const done = task.status === 'done';
  const missed = task.status === 'missed';
  const previousStatus = useRef(task.status);
  const completion = useSharedValue(done ? 1 : 0);
  const checkScale = useSharedValue(1);
  const opacity = useSharedValue(missed ? 0.72 : 1);
  useEffect(() => {
    completion.value = withSpring(done ? 1 : 0, {
      duration: 560,
      dampingRatio: 0.85,
      reduceMotion: ReduceMotion.System,
    });
    if (previousStatus.current !== task.status) {
      checkScale.value = withSequence(
        ReduceMotion.System,
        withTiming(1.18, { duration: 200, reduceMotion: ReduceMotion.System }),
        withSpring(1, {
          duration: 500,
          dampingRatio: 0.65,
          reduceMotion: ReduceMotion.System,
        }),
      );
      previousStatus.current = task.status;
    }
    opacity.value = withTiming(missed ? 0.72 : 1, {
      duration: 560,
      easing: Easing.inOut(Easing.cubic),
      reduceMotion: ReduceMotion.System,
    });
  }, [task.status, done, missed, checkScale, completion, opacity]);
  const motion = useAnimatedStyle(() => ({
    opacity: opacity.value,
    backgroundColor: interpolateColor(
      completion.value,
      [0, 1],
      [theme.backgroundElement, theme.accentSoft],
    ),
    borderColor: interpolateColor(
      completion.value,
      [0, 1],
      [theme.border, theme.accent],
    ),
  }));
  const checkMotion = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      completion.value,
      [0, 1],
      [theme.backgroundElement, theme.accent],
    ),
    borderRadius: 18 - 6 * completion.value,
    transform: [{ scale: checkScale.value }],
  }));
  const tickMotion = useAnimatedStyle(() => ({
    opacity: completion.value,
    transform: [
      { scale: 0.4 + 0.6 * completion.value },
      { rotate: `${-35 * (1 - completion.value)}deg` },
    ],
  }));
  const labelMotion = useAnimatedStyle(() => ({
    color: interpolateColor(
      completion.value,
      [0, 1],
      [theme.text, theme.accent],
    ),
    transform: [{ translateX: 4 * completion.value }],
  }));
  const strikeMotion = useAnimatedStyle(() => ({
    opacity: completion.value,
    width: `${Math.max(0, Math.min(1, completion.value)) * 100}%`,
  }));

  const run = async (kind: 'swap' | 'shrink') => {
    setBusy(kind);
    try {
      if (kind === 'swap') await swap({ taskId: task._id, today });
      else await shrink({ taskId: task._id, minutes: 10, today });
    } catch {
      setError(
        'Couldn’t change this step. Check your connection and try again.',
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Animated.View
      style={[
        { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
        motion,
      ]}
    >
      <Card style={{ backgroundColor: 'transparent', borderWidth: 0 }}>
        <View style={styles.row}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: done }}
            accessibilityLabel={
              done ? `Undo ${task.title}` : `Complete ${task.title}`
            }
            onPress={() =>
              setDone({ taskId: task._id, done: !done, today }).catch(() =>
                setError('Couldn’t save that check-in. Try again.'),
              )
            }
            hitSlop={10}
            style={{
              minWidth: 44,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Animated.View
              aria-hidden
              style={[styles.check, { borderColor: theme.accent }, checkMotion]}
            >
              <Animated.Text
                style={[
                  { color: theme.onAccent, fontSize: 22, fontWeight: '800' },
                  tickMotion,
                ]}
              >
                ✓
              </Animated.Text>
            </Animated.View>
          </Pressable>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ alignSelf: 'flex-start', maxWidth: '100%' }}>
              <Animated.Text
                style={[
                  { fontSize: 21, lineHeight: 28, fontWeight: '600' },
                  labelMotion,
                ]}
              >
                {task.title}
              </Animated.Text>
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    top: '50%',
                    height: 1.5,
                    backgroundColor: theme.accent,
                  },
                  strikeMotion,
                ]}
              />
            </View>
            <T size={22} weight="700" tone="accent">
              {task.minutes} min{task.shrunk ? ' · shrunk' : ''}
            </T>
            {missed ? (
              <T size={13} tone="textSecondary">
                Skipped
              </T>
            ) : null}
          </View>
        </View>
        <View style={styles.tag}>
          <T size={12} tone="textSecondary" numberOfLines={2}>
            {task.goalTitle} · {task.rungTitle}
          </T>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: why }}
          onPress={() => setWhy(!why)}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <T size={13} tone="accent">
            Why this step? {why ? '−' : '+'}
          </T>
        </Pressable>
        <FlowReveal open={why}>
          <T size={14} tone="textSecondary">
            {task.why}
          </T>
        </FlowReveal>
        {error ? <T size={13}>{error}</T> : null}
        {!past && task.status === 'open' ? (
          <View style={styles.actions}>
            <Button
              small
              kind="quiet"
              label="Swap"
              busy={busy === 'swap'}
              disabled={!!busy}
              onPress={() => run('swap')}
            />
            {task.minutes > 10 ? (
              <Button
                small
                kind="quiet"
                label="Make it 10 min"
                busy={busy === 'shrink'}
                disabled={!!busy}
                onPress={() => run('shrink')}
              />
            ) : null}
            <Button
              small
              kind="ghost"
              label="Not today"
              disabled={!!busy}
              onPress={() =>
                miss({ taskId: task._id, today }).catch(() =>
                  setError('Couldn’t save that check-in. Try again.'),
                )
              }
            />
          </View>
        ) : null}
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center' },
  check: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tag: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    maxWidth: '100%',
  },
  actions: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
});
