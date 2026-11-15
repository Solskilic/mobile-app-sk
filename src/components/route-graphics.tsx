import { useEffect, useState, type ReactNode } from 'react';
import {
  Platform,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, {
  Circle,
  G,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import Animated, {
  Easing,
  FadeInDown,
  LinearTransition,
  ReduceMotion,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/hooks/use-theme';

const Stroke = Animated.createAnimatedComponent(Path);
const Bar = Animated.createAnimatedComponent(Rect);
export const enter =
  Platform.OS === 'web'
    ? undefined
    : FadeInDown.duration(560)
        .withInitialValues({ transform: [{ translateY: 12 }] })
        .reduceMotion(ReduceMotion.System);
export const resize =
  Platform.OS === 'web'
    ? undefined
    : LinearTransition.duration(560).reduceMotion(ReduceMotion.System);

export function MotionGroup({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, {
      duration: 680,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      reduceMotion: ReduceMotion.System,
    });
  }, [progress]);
  const motion = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: 22 * (1 - progress.value) }],
  }));
  return (
    <Animated.View style={[{ gap: 20 }, style, motion]} collapsable={false}>
      {children}
    </Animated.View>
  );
}

export function FlowReveal({
  open,
  children,
  style,
}: {
  open: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const [height, setHeight] = useState(0);
  const visibleHeight = useSharedValue(0);
  const progress = useSharedValue(0);
  useEffect(() => {
    const config = {
      duration: 560,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      reduceMotion: ReduceMotion.System,
    };
    visibleHeight.value = withTiming(open ? height : 0, config);
    progress.value = withTiming(open ? 1 : 0, config);
  }, [open, height, progress, visibleHeight]);
  const motion = useAnimatedStyle(() => ({
    height: visibleHeight.value,
    opacity: progress.value,
  }));
  return (
    <Animated.View
      style={[style, { overflow: 'hidden' }, motion]}
      pointerEvents={open ? 'auto' : 'none'}
      aria-hidden={!open}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
    >
      <View
        style={{ position: 'absolute', top: 0, left: 0, right: 0 }}
        onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      >
        {children}
      </View>
    </Animated.View>
  );
}

function DrawPath({
  d,
  color,
  width = 3,
  length,
}: {
  d: string;
  color: string;
  width?: number;
  length: number;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: 780,
      easing: Easing.inOut(Easing.cubic),
      reduceMotion: ReduceMotion.System,
    });
  }, [d, progress]);
  const props = useAnimatedProps(() => ({
    strokeDashoffset: length * (1 - progress.value),
  }));
  return (
    <Stroke
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeDasharray={`${length} ${length}`}
      animatedProps={props}
    />
  );
}

export function GoalGlyph({
  name,
  size = 46,
}: {
  name: string;
  size?: number;
}) {
  const theme = useTheme();
  const music = /guitar|piano|music|violin|instrument|drum|flute|song/i.test(
    name,
  );
  const run = /run|marathon|jog|5k|10k/i.test(name);
  const career = /bank|career|analyst|job|work|finance|degree|study/i.test(
    name,
  );
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Rect
        x="1"
        y="1"
        width="62"
        height="62"
        rx="19"
        fill={theme.accentSoft}
      />
      <G
        stroke={theme.text}
        strokeWidth="2.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        {music ? (
          <>
            <Path d="M28 42V21l20-5v23M28 26l20-5" />
            <Circle cx="22" cy="43" r="6" fill={theme.accent} />
            <Circle cx="42" cy="40" r="6" fill={theme.accent} />
          </>
        ) : run ? (
          <>
            <Path
              d="M14 41c12-2 14-9 17-19l9 8-4 8 14 7v7H15z"
              fill={theme.accent}
            />
            <Path d="M23 38l8 5m-2-10 8 5M15 47h35" />
          </>
        ) : career ? (
          <>
            <Path d="M13 25l19-10 19 10z" fill={theme.accent} />
            <Path d="M17 30v16m10-16v16m10-16v16m10-16v16M13 50h38M11 54h42" />
          </>
        ) : (
          <>
            <Circle cx="22" cy="25" r="6" fill={theme.accent} />
            <Circle cx="43" cy="25" r="6" />
            <Path d="M11 46v-4c0-8 22-8 22 0v4m2-12c10-2 18 2 18 8v4" />
          </>
        )}
      </G>
    </Svg>
  );
}

export function StepStrip({
  total,
  current,
  completed = false,
}: {
  total: number;
  current: number;
  completed?: boolean;
}) {
  const theme = useTheme();
  const n = Math.max(1, Math.min(total, 12));
  const x = (i: number) => (n === 1 ? 150 : 15 + (i * 270) / (n - 1));
  return (
    <Svg
      width="100%"
      height={36}
      viewBox="0 0 300 36"
      accessibilityLabel={`${current} of ${total} ${completed ? 'stops completed' : 'setup steps'}`}
    >
      <Line
        x1={x(0)}
        y1="18"
        x2={x(n - 1)}
        y2="18"
        stroke={theme.border}
        strokeWidth="3"
      />
      {current > 0 ? (
        <DrawPath
          d={`M${x(0)} 18H${x(Math.min(current, n - 1))}`}
          length={Math.max(1, x(Math.min(current, n - 1)) - x(0))}
          color={theme.accent}
        />
      ) : null}
      {Array.from({ length: n }, (_, i) => (
        <G key={i}>
          <Circle
            cx={x(i)}
            cy="18"
            r={i === current ? 10 : 7}
            fill={i < current ? theme.accent : theme.backgroundElement}
            stroke={i <= current ? theme.accent : theme.border}
            strokeWidth={i === current ? 2.5 : 1.5}
          />
          {i < current ? (
            <Circle cx={x(i)} cy="18" r="2" fill={theme.onAccent} />
          ) : null}
        </G>
      ))}
    </Svg>
  );
}

export function RouteNetwork({
  goals,
  sharedTitle,
}: {
  goals: { key: string; title: string }[];
  sharedTitle: string;
}) {
  const theme = useTheme();
  const visible = goals.slice(0, 2);
  if (!visible.length) return null;
  return (
    <View
      style={{ gap: 5 }}
      accessibilityLabel={`Shared step: ${sharedTitle}. Goals: ${visible.map((g) => g.title).join(', ')}`}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-around',
          gap: 18,
        }}
      >
        {visible.map((g) => (
          <View key={g.key} style={{ flex: 1, gap: 8, alignItems: 'center' }}>
            <GoalGlyph name={g.title} />
            <Text
              style={{
                color: theme.text,
                fontWeight: '600',
                fontSize: 13,
                textAlign: 'center',
              }}
            >
              {g.title}
            </Text>
          </View>
        ))}
      </View>
      <Svg width="100%" height="74" viewBox="0 0 300 74">
        {visible.length > 1 ? (
          <>
            <DrawPath
              d="M75 3C75 35 112 40 150 40"
              length={94}
              color={theme.accent}
            />
            <DrawPath
              d="M225 3C225 35 188 40 150 40"
              length={94}
              color={theme.accent}
            />
            <DrawPath d="M150 40V61" length={21} color={theme.accent} />
          </>
        ) : (
          <DrawPath d="M150 3V61" length={58} color={theme.accent} />
        )}
        <Circle
          cx="150"
          cy="59"
          r="12"
          fill={theme.accent}
          stroke={theme.text}
          strokeWidth="2"
        />
        <Line
          x1="145"
          y1="59"
          x2="155"
          y2="59"
          stroke={theme.onAccent}
          strokeWidth="2"
        />
        <Circle cx="144" cy="59" r="3" fill={theme.onAccent} />
        <Circle cx="156" cy="59" r="3" fill={theme.onAccent} />
      </Svg>
      <Text
        style={{
          color: theme.accent,
          fontSize: 11,
          fontWeight: '700',
          textAlign: 'center',
        }}
      >
        SHARED STEP
      </Text>
      <Text
        style={{
          color: theme.text,
          fontSize: 21,
          lineHeight: 28,
          fontWeight: '600',
          textAlign: 'center',
        }}
      >
        {sharedTitle}
      </Text>
    </View>
  );
}

export function EvidenceGlyph({ count }: { count?: number }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <Svg width="94" height="56" viewBox="0 0 94 56">
        <DrawPath
          d="M25 14H42Q52 14 52 28T66 42H76M25 42H42Q52 42 52 28T66 14H76"
          length={75}
          color={theme.accent}
          width={2}
        />
        {[6, 32].map((y) => (
          <G key={y}>
            <Rect
              x="3"
              y={y}
              width="23"
              height="19"
              rx="4"
              fill={theme.backgroundElement}
              stroke={theme.text}
              strokeWidth="1.6"
            />
            <Path
              d={`M8 ${y + 6}H21M8 ${y + 11}H17`}
              stroke={theme.text}
              strokeWidth="1.5"
            />
          </G>
        ))}
        <Circle
          cx="78"
          cy="28"
          r="12"
          fill={theme.accent}
          stroke={theme.text}
          strokeWidth="1.6"
        />
      </Svg>
      {count !== undefined ? (
        <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>
          {count} checked sources
        </Text>
      ) : null}
    </View>
  );
}

function DistanceBar({
  width,
  y,
  color,
}: {
  width: number;
  y: number;
  color: string;
}) {
  const value = useSharedValue(0);
  useEffect(() => {
    value.value = withTiming(width, {
      duration: 720,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.System,
    });
  }, [width, value]);
  const props = useAnimatedProps(() => ({ width: value.value }));
  return (
    <Bar x="88" y={y} height="10" rx="5" fill={color} animatedProps={props} />
  );
}

export function RunDistanceGraphic({
  runs,
}: {
  runs: { _id: string; date: string; distance: number }[];
}) {
  const theme = useTheme();
  const recent = runs.slice(0, 4).reverse();
  const max = Math.max(1, ...recent.map((r) => r.distance));
  if (!recent.length) return <GoalGlyph name="Run" size={54} />;
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
        Recent manual runs · distance
      </Text>
      <Svg
        width="100%"
        height={recent.length * 29 + 5}
        viewBox={`0 0 300 ${recent.length * 29 + 5}`}
        accessibilityLabel={recent
          .map((r) => `${r.date}: ${r.distance / 1000} kilometres`)
          .join('. ')}
      >
        {recent.map((r, i) => (
          <G key={r._id}>
            <SvgText
              x="0"
              y={i * 29 + 14}
              fill={theme.textSecondary}
              fontSize="11"
            >
              {r.date.slice(5)}
            </SvgText>
            <Rect
              x="88"
              y={i * 29 + 4}
              width="152"
              height="10"
              rx="5"
              fill={theme.backgroundSelected}
            />
            <DistanceBar
              width={(152 * r.distance) / max}
              y={i * 29 + 4}
              color={theme.accent}
            />
            <SvgText x="250" y={i * 29 + 14} fill={theme.text} fontSize="11">
              {r.distance / 1000} km
            </SvgText>
          </G>
        ))}
      </Svg>
    </View>
  );
}

export function GalleryGlyph() {
  const theme = useTheme();
  return (
    <Svg width="60" height="48" viewBox="0 0 60 48">
      <Rect
        x="7"
        y="5"
        width="39"
        height="31"
        rx="6"
        fill={theme.accentSoft}
        stroke={theme.text}
        strokeWidth="1.5"
        transform="rotate(-8 26 20)"
      />
      <Rect
        x="14"
        y="12"
        width="40"
        height="31"
        rx="6"
        fill={theme.backgroundElement}
        stroke={theme.text}
        strokeWidth="1.8"
      />
      <Circle cx="43" cy="21" r="4" fill={theme.accent} />
      <Path
        d="M18 37l10-12 9 9 5-5 8 8"
        stroke={theme.text}
        strokeWidth="1.8"
        fill="none"
      />
    </Svg>
  );
}
