import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
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

type Tone = 'text' | 'textSecondary' | 'accent' | 'realistic' | 'stretch' | 'unrealistic' | 'onAccent';

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
      style={[{ color: theme[tone], fontSize: size, lineHeight: Math.round(size * 1.35), fontWeight: weight }, style]}>
      {children}
    </Text>
  );
}

export function Screen({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{
        paddingTop: Platform.OS === 'web' ? Spacing.six + Spacing.three : insets.top + Spacing.three,
        paddingBottom: insets.bottom + BottomTabInset + Spacing.six,
        paddingHorizontal: Spacing.three,
        alignItems: 'center',
      }}
      keyboardShouldPersistTaps="handled">
      <View style={{ width: '100%', maxWidth: MaxContentWidth, gap: Spacing.four }}>{children}</View>
    </ScrollView>
  );
}

export function Card({ children, style, soft }: { children: ReactNode; style?: StyleProp<ViewStyle>; soft?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: soft ? theme.accentSoft : theme.backgroundElement, borderColor: theme.border },
        style,
      ]}>
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
  const bg = kind === 'primary' ? theme.accent : kind === 'quiet' ? theme.backgroundSelected : 'transparent';
  const fg = kind === 'primary' ? 'onAccent' : kind === 'quiet' ? 'text' : 'accent';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
      ]}>
      {busy ? (
        <ActivityIndicator color={theme[fg]} />
      ) : (
        <T size={small ? 13 : 16} weight="600" tone={fg}>
          {label}
        </T>
      )}
    </Pressable>
  );
}

export function BackLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={12} style={{ alignSelf: 'flex-start' }}>
      <T size={15} weight="600" tone="accent">
        ‹ Back
      </T>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.accent : theme.backgroundElement,
          borderColor: selected ? theme.accent : theme.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}>
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

type LadderRung = { _id: string; title: string; identity: string; weeks: number; kind: string; completedAt?: number };
type LadderGoal = { currentRung: number; startedAt?: number; projectedFinish?: number; status: string; routeId?: string };

export function Ladder({ goal, rungs, large }: { goal: LadderGoal; rungs: LadderRung[]; large?: boolean }) {
  const theme = useTheme();
  const dates = rungDates(goal.routeId ? { ...goal, projectedFinish: undefined } : goal, rungs);
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
            <View style={{ height: large ? 124 : 72, justifyContent: 'flex-end', width: '100%' }}>
              <View
                style={[
                  styles.ladderBar,
                  {
                    height,
                    backgroundColor: done ? theme.accent : current ? theme.accentSoft : 'transparent',
                    borderColor: done || current ? theme.accent : theme.border,
                    borderStyle: rung.kind === 'explore' && !done ? 'dashed' : 'solid',
                  },
                ]}>
                <T size={11} weight="700" tone={done ? 'onAccent' : current ? 'accent' : 'textSecondary'}>
                  {done ? 'DONE' : current ? 'NOW' : i === goal.currentRung + 1 ? 'NEXT' : ''}
                </T>
              </View>
            </View>
            <T size={large ? 13 : 12} weight={current ? '700' : '500'} tone={current ? 'text' : 'textSecondary'} numberOfLines={3} style={{ textAlign: 'center' }}>
              {rung.title}
            </T>
            {date ? (
              <T size={11} tone="textSecondary" style={{ textAlign: 'center' }}>
                {done && rung.completedAt ? formatDay(rung.completedAt) : formatDay(date)}
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

export function VerdictCard({ verdict }: { verdict: { level: keyof typeof verdictCopy; why: string; adjustment: string } }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { borderColor: theme[verdict.level], borderWidth: 2, backgroundColor: theme.backgroundElement }]}>
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
  smart: { specific: string; measurable: string; achievable: string; relevant: string; timeBound: string; statement: string };
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
        <View key={key} style={{ flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' }}>
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
  return (
    <Modal visible={!!win} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.celebrate, { backgroundColor: theme.background, borderColor: theme.accent }]}>
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
        </View>
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
    minHeight: 48,
    borderRadius: 14,
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
