import { useEffect, type ReactNode } from 'react';
import Animated, {
  interpolateColor,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { router, usePathname } from 'expo-router';
import { useConvexConnectionState } from 'convex/react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDay, rungDates } from '@/lib/plan';
import { MotionGroup } from '@/components/route-graphics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Tone =
  | 'text'
  | 'textSecondary'
  | 'accent'
  | 'realistic'
  | 'stretch'
  | 'unrealistic'
  | 'onAccent';

export function T({
  children,
  size = 16,
  weight = '500',
  tone = 'text',
  style,
  numberOfLines,
}: {
  children: ReactNode;
  size?: number;
  weight?: TextStyle['fontWeight'];
  tone?: Tone;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const theme = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          color: theme[tone],
          fontSize: size,
          lineHeight: Math.round(size * 1.35),
          fontWeight: weight,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Screen({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const connected = useConvexConnectionState().isWebSocketConnected;
  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={{
          paddingTop: insets.top + Spacing.three,
          paddingBottom: insets.bottom + BottomTabInset + Spacing.six,
          paddingHorizontal: Spacing.four,
          alignItems: 'center',
        }}
        keyboardShouldPersistTaps="handled"
      >
        <MotionGroup
          style={{
            width: '100%',
            maxWidth: MaxContentWidth,
            gap: Spacing.four,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <T size={25} weight="700">
              route<T tone="accent">↗</T>
            </T>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/profile')}
              hitSlop={8}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <T size={12} weight="600" tone="accent">
                Demo profile
              </T>
            </Pressable>
          </View>
          {!connected ? (
            <T size={13} tone="textSecondary">
              Connecting / offline · new changes need a connection.
            </T>
          ) : null}
          {children}
        </MotionGroup>
      </ScrollView>
      <View
        style={{
          paddingBottom: Math.max(insets.bottom, 12),
          paddingTop: 12,
          paddingHorizontal: 24,
          flexDirection: 'row',
          gap: 10,
          justifyContent: 'center',
          backgroundColor: theme.background,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderColor: theme.border,
        }}
      >
        {[
          { label: 'Your route', href: '/' as const },
          { label: 'Today', href: '/today' as const },
        ].map((tab) => (
          <Pressable
            key={tab.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: path === tab.href }}
            onPress={() => router.replace(tab.href)}
            style={{
              paddingVertical: 12,
              paddingHorizontal: 28,
              borderRadius: 24,
              backgroundColor: path === tab.href ? theme.accent : 'transparent',
            }}
          >
            <T
              weight="600"
              size={15}
              tone={path === tab.href ? 'onAccent' : 'textSecondary'}
            >
              {tab.label}
            </T>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function Card({
  children,
  style,
  soft,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  soft?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: soft ? theme.accentSoft : theme.backgroundElement,
          borderColor: theme.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  busy,
  disabled,
  small,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'quiet' | 'ghost';
  busy?: boolean;
  disabled?: boolean;
  small?: boolean;
}) {
  const theme = useTheme();
  const press = useSharedValue(1);
  const motion = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }],
  }));
  const bg =
    kind === 'primary'
      ? theme.accent
      : kind === 'quiet'
        ? theme.backgroundSelected
        : 'transparent';
  const fg =
    kind === 'primary' ? 'onAccent' : kind === 'quiet' ? 'text' : 'accent';
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      onPress={onPress}
      onPressIn={() =>
        press.set(
          withSpring(0.96, {
            duration: 450,
            dampingRatio: 0.8,
            reduceMotion: ReduceMotion.System,
          }),
        )
      }
      onPressOut={() =>
        press.set(
          withSpring(1, {
            duration: 500,
            dampingRatio: 0.7,
            reduceMotion: ReduceMotion.System,
          }),
        )
      }
      disabled={disabled || busy}
      style={[
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg, opacity: disabled ? 0.4 : 1 },
        motion,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={theme[fg]} />
      ) : (
        <T size={small ? 13 : 16} weight="600" tone={fg}>
          {label}
        </T>
      )}
    </AnimatedPressable>
  );
}

export function BackLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={12}
      style={{ alignSelf: 'flex-start' }}
    >
      <T size={15} weight="600" tone="accent">
        ‹ Back
      </T>
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.accent : theme.backgroundElement,
          borderColor: selected ? theme.accent : theme.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <T size={14} weight="600" tone={selected ? 'onAccent' : 'text'}>
        {label}
      </T>
    </Pressable>
  );
}

export function Thinking({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <Card style={{ alignItems: 'center', paddingVertical: Spacing.five }}>
      <ActivityIndicator color={theme.accent} />
      <T tone="textSecondary">{label}</T>
    </Card>
  );
}

type LadderRung = {
  _id: string;
  title: string;
  identity: string;
  weeks: number;
  kind: string;
  completedAt?: number;
};
type LadderGoal = {
  currentRung: number;
  startedAt?: number;
  projectedFinish?: number;
  status: string;
  routeId?: string;
};

function RungBar({
  height,
  done,
  current,
  explore,
  children,
}: {
  height: number;
  done: boolean;
  current: boolean;
  explore: boolean;
  children: ReactNode;
}) {
  const theme = useTheme();
  const barHeight = useSharedValue(0);
  const state = useSharedValue(done ? 2 : current ? 1 : 0);
  useEffect(() => {
    const spring = {
      duration: 560,
      dampingRatio: 0.8,
      reduceMotion: ReduceMotion.System,
    };
    barHeight.value = withSpring(height, spring);
    state.value = withSpring(done ? 2 : current ? 1 : 0, spring);
  }, [height, done, current, barHeight, state]);
  const motion = useAnimatedStyle(() => ({
    height: barHeight.value,
    backgroundColor: interpolateColor(
      state.value,
      [0, 1, 2],
      [theme.backgroundSelected, theme.accentSoft, theme.accent],
    ),
    borderColor: interpolateColor(
      state.value,
      [0, 1, 2],
      [theme.border, theme.accent, theme.accent],
    ),
  }));
  return (
    <Animated.View
      style={[
        styles.ladderBar,
        { borderStyle: explore && !done ? 'dashed' : 'solid' },
        motion,
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function Ladder({
  goal,
  rungs,
  large,
}: {
  goal: LadderGoal;
  rungs: LadderRung[];
  large?: boolean;
}) {
  const dates = rungDates(
    goal.routeId ? { ...goal, projectedFinish: undefined } : goal,
    rungs,
  );
  const max = rungs.length;
  return (
    <View style={styles.ladder}>
      {rungs.map((rung, i) => {
        const done = i < goal.currentRung || goal.status === 'done';
        const current = i === goal.currentRung && goal.status !== 'done';
        const height = (large ? 36 : 22) + ((large ? 84 : 46) * (i + 1)) / max;
        const date = dates[i];
        return (
          <View key={rung._id} style={styles.ladderCol}>
            <View
              style={{
                height: large ? 124 : 72,
                justifyContent: 'flex-end',
                width: '100%',
              }}
            >
              <RungBar
                height={height}
                done={done}
                current={current}
                explore={rung.kind === 'explore'}
              >
                <T
                  size={11}
                  weight="700"
                  tone={
                    done ? 'onAccent' : current ? 'accent' : 'textSecondary'
                  }
                >
                  {done
                    ? 'DONE'
                    : current
                      ? 'NOW'
                      : i === goal.currentRung + 1
                        ? 'NEXT'
                        : ''}
                </T>
              </RungBar>
            </View>
            <T
              size={large ? 13 : 12}
              weight={current ? '700' : '500'}
              tone={current ? 'text' : 'textSecondary'}
              numberOfLines={3}
              style={{ textAlign: 'center' }}
            >
              {rung.title}
            </T>
            {date ? (
              <T size={11} tone="textSecondary" style={{ textAlign: 'center' }}>
                {done && rung.completedAt
                  ? formatDay(rung.completedAt)
                  : formatDay(date)}
              </T>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const verdictCopy = {
  realistic: 'Realistic',
  stretch: 'A stretch',
  unrealistic: 'Unrealistic as stated',
} as const;

export function VerdictCard({
  verdict,
}: {
  verdict: { level: keyof typeof verdictCopy; why: string; adjustment: string };
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          borderColor: theme[verdict.level],
          borderWidth: 2,
          backgroundColor: theme.backgroundElement,
        },
      ]}
    >
      <T size={12} weight="700" tone="textSecondary">
        REALITY CHECK
      </T>
      <T size={28} weight="700" tone={verdict.level}>
        {verdictCopy[verdict.level]}
      </T>
      <T>{verdict.why}</T>
      <View style={{ gap: Spacing.one }}>
        <T size={13} weight="700" tone="textSecondary">
          SUGGESTED ADJUSTMENT
        </T>
        <T>{verdict.adjustment}</T>
      </View>
    </View>
  );
}

const SMART_LETTERS = [
  ['S', 'Specific', 'specific'],
  ['M', 'Measurable', 'measurable'],
  ['A', 'Achievable', 'achievable'],
  ['R', 'Relevant', 'relevant'],
  ['T', 'Time-bound', 'timeBound'],
] as const;

export function SmartCard({
  smart,
}: {
  smart: {
    specific: string;
    measurable: string;
    achievable: string;
    relevant: string;
    timeBound: string;
    statement: string;
  };
}) {
  const theme = useTheme();
  return (
    <Card>
      <T size={12} weight="700" tone="textSecondary">
        SMART VERSION
      </T>
      <T size={17} weight="600">
        {smart.statement}
      </T>
      {SMART_LETTERS.map(([letter, name, key]) => (
        <View
          key={key}
          style={{
            flexDirection: 'row',
            gap: Spacing.three,
            alignItems: 'flex-start',
          }}
        >
          <View style={[styles.letter, { backgroundColor: theme.accentSoft }]}>
            <T weight="800" tone="accent">
              {letter}
            </T>
          </View>
          <View style={{ flex: 1 }}>
            <T size={12} weight="700" tone="textSecondary">
              {name}
            </T>
            <T size={15}>{smart[key]}</T>
          </View>
        </View>
      ))}
    </Card>
  );
}

export function Celebration({
  win,
  onClose,
}: {
  win: { kind: 'rung' | 'goal'; identity: string; next: string | null } | null;
  onClose: () => void;
}) {
  const theme = useTheme();
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withSpring(win ? 1 : 0, {
      duration: 560,
      dampingRatio: 0.8,
      reduceMotion: ReduceMotion.System,
    });
  }, [win, progress]);
  const motion = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { scale: 0.88 + 0.12 * progress.value },
      { translateY: 24 * (1 - progress.value) },
    ],
  }));
  return (
    <Modal
      visible={!!win}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Animated.View
          style={[
            styles.celebrate,
            { backgroundColor: theme.background, borderColor: theme.accent },
            motion,
          ]}
        >
          <T size={44}>{win?.kind === 'goal' ? '🏔️' : '🪜'}</T>
          <T size={13} weight="700" tone="accent">
            {win?.kind === 'goal' ? 'GOAL COMPLETE' : 'RUNG CLIMBED'}
          </T>
          <T size={24} weight="700" style={{ textAlign: 'center' }}>
            {win?.identity}
          </T>
          {win?.next ? (
            <T tone="textSecondary" style={{ textAlign: 'center' }}>
              Next up: {win.next}
            </T>
          ) : null}
          <Button label="Keep climbing" onPress={onClose} />
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: Spacing.three + 2,
    gap: Spacing.two + 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
  button: {
    minHeight: 54,
    borderRadius: 18,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSmall: {
    minHeight: 32,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  ladder: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'stretch',
  },
  ladderCol: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
  },
  ladderBar: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: Spacing.one,
  },
  letter: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  celebrate: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 2,
    padding: Spacing.four,
    gap: Spacing.three,
    alignItems: 'center',
  },
});
