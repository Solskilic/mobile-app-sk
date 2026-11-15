import { useMutation } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { BackLink, Button, Card, Chip, Screen, T } from '@/components/goal-ui';
import { MotionGroup, StepStrip } from '@/components/route-graphics';
import { useTheme } from '@/hooks/use-theme';
import { useToday } from '@/hooks/use-today';
import { DEVICE_ID } from '@/lib/plan';
import {
  DEMO_EXAMPLES,
  DEMO_NOTICE,
  EMPTY_DEMO_PROFILE,
} from '@/lib/demo-profile';
import { api } from '../../../convex/_generated/api';
import {
  profileContext,
  type DemoProfile,
} from '../../../convex/demoProfileTypes';

type Horizon = { kind: 'flexible' | 'byDate' | 'exploration'; date?: string };
type Stage =
  | 'goals'
  | 'starting'
  | 'location'
  | 'role'
  | 'why'
  | 'time'
  | 'structure'
  | 'timing';

export default function GrandListScreen() {
  const theme = useTheme();
  const today = useToday();
  const create = useMutation(api.route.create);
  const [input, setInput] = useState('');
  const [profile, setProfile] = useState<DemoProfile>(EMPTY_DEMO_PROFILE);
  const [hours, setHours] = useState('6');
  const [location, setLocation] = useState('Not sure');
  const [role, setRole] = useState('Not sure');
  const [step, setStep] = useState(0);
  const [horizons, setHorizons] = useState<Record<string, Horizon>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const career =
    /investment bank|career|pivot|become.*(?:analyst|associate)/i.test(input);
  const statedStartingPoint =
    /complete beginner|comfortable.*5k|currently|experience|graduate|starting from/i.test(
      input,
    );
  const stages: Stage[] = [
    'goals',
    ...(!statedStartingPoint ? ['starting' as const] : []),
    ...(career ? ['location' as const, 'role' as const] : []),
    'why',
    'time',
    'structure',
    'timing',
  ];
  const stage = stages[Math.min(step, stages.length - 1)];
  const items = input
    .split(/[\n;]+/)
    .map((s) => s.replace(/^[-•]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 20);
  const field = {
    color: theme.text,
    backgroundColor: theme.backgroundElement,
    fontSize: 19,
    lineHeight: 28,
    minHeight: 110,
    textAlignVertical: 'top' as const,
    paddingVertical: 10,
  };
  const next = () => {
    setError('');
    setStep((i) => Math.min(i + 1, stages.length - 1));
  };
  const update = (
    key: 'startingPoint' | 'motivation' | 'constraints',
    value: string,
  ) => setProfile((p) => ({ ...p, [key]: value }));
  async function build() {
    if (!confirmed || busy) return;
    const weeklyHours = Number(hours);
    if (!Number.isFinite(weeklyHours) || weeklyHours < 1 || weeklyHours > 40) {
      setError('Choose between 1 and 40 weekly hours.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const value = {
        ...profile,
        weeklyHours,
        startingPoint:
          statedStartingPoint && profile.startingPoint === 'Not sure'
            ? input.slice(0, 600)
            : profile.startingPoint,
      };
      const routeId = await create({
        deviceId: DEVICE_ID,
        input,
        dedication: 'steady',
        weeklyHours,
        today,
        profileContext: profileContext(value),
        demoProfile: value,
        goalHorizons: items.map((goal) => ({
          goal,
          horizon: horizons[goal] ?? { kind: 'flexible' },
        })),
        ...(career
          ? {
              careerContext: {
                background: value.startingPoint,
                location: location.trim() || 'Not sure',
                targetRole: role.trim() || 'Not sure',
              },
            }
          : {}),
      });
      router.replace({ pathname: '/goals/route', params: { routeId } });
    } catch {
      setError(
        'Couldn’t save the demo route. Check the dates and connection, then retry.',
      );
    } finally {
      setBusy(false);
    }
  }
  const titles: Record<Stage, string> = {
    goals: 'What would you like to change?',
    starting: 'What’s the starting point?',
    location: 'Where is the career move?',
    role: 'Which entry role?',
    why: 'Why does this goal matter?',
    time: 'What time is realistic?',
    structure: 'Routine or flexible?',
    timing: 'Does timing matter?',
  };
  const answer =
    stage === 'starting'
      ? profile.startingPoint
      : stage === 'location'
        ? location
        : stage === 'role'
          ? role
          : profile.motivation;
  return (
    <Screen key={stage}>
      <MotionGroup>
        {step ? <BackLink onPress={() => setStep((i) => i - 1)} /> : null}
        <StepStrip total={stages.length} current={step} />
        <T size={12} tone="accent" weight="700">
          FICTIONAL DEMO SCENARIO
        </T>
        <T size={36} weight="600">
          {titles[stage]}
        </T>
        {stage === 'goals' ? (
          <>
            <T size={13} tone="textSecondary">
              {DEMO_NOTICE} Don’t enter personal information.
            </T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {DEMO_EXAMPLES.map((example) => (
                <Chip
                  key={example.label}
                  label={example.label}
                  onPress={() => {
                    setInput(example.goal);
                    setProfile(example.profile);
                    setHours(String(example.profile.weeklyHours));
                    setLocation(example.location ?? 'Not sure');
                    setRole(example.role ?? 'Not sure');
                  }}
                />
              ))}
            </View>
            <Card>
              <TextInput
                accessibilityLabel="Fictional demo goals"
                multiline
                value={input}
                onChangeText={setInput}
                placeholder="Choose an example or edit a fictional goal. One goal per line."
                placeholderTextColor={theme.textSecondary}
                maxLength={6000}
                style={[field, { minHeight: 155 }]}
              />
            </Card>
            <Button label="Continue" disabled={!input.trim()} onPress={next} />
          </>
        ) : stage === 'starting' ||
          stage === 'location' ||
          stage === 'role' ||
          stage === 'why' ? (
          <>
            <T size={14} tone="textSecondary">
              {stage === 'starting'
                ? 'Use a fictional life stage, background and current experience.'
                : stage === 'location'
                  ? 'Use a sample city or country. Unknown details can stay unknown.'
                  : stage === 'role'
                    ? 'For example: analyst, associate, or not sure.'
                    : 'Use a sample reason. This helps choose relevant practice, not a personality label.'}
            </T>
            <Card>
              <TextInput
                accessibilityLabel={titles[stage]}
                multiline
                value={answer === 'Not sure' ? '' : answer}
                onChangeText={(text) =>
                  stage === 'starting'
                    ? update('startingPoint', text)
                    : stage === 'location'
                      ? setLocation(text)
                      : stage === 'role'
                        ? setRole(text)
                        : update('motivation', text)
                }
                placeholder="Fictional answer (optional)"
                placeholderTextColor={theme.textSecondary}
                maxLength={600}
                style={field}
              />
            </Card>
            <Button label="Continue" onPress={next} />
            <Button
              kind="ghost"
              label="Not sure · skip"
              onPress={() => {
                if (stage === 'starting') update('startingPoint', 'Not sure');
                if (stage === 'location') setLocation('Not sure');
                if (stage === 'role') setRole('Not sure');
                if (stage === 'why') update('motivation', '');
                next();
              }}
            />
          </>
        ) : stage === 'time' ? (
          <>
            <T size={14} tone="textSecondary">
              Edit the fictional weekly budget and any fixed scheduling
              constraints.
            </T>
            <Card>
              <T size={14}>Hours across all goals</T>
              <TextInput
                accessibilityLabel="Available hours per week"
                value={hours}
                onChangeText={setHours}
                keyboardType="decimal-pad"
                style={[field, { minHeight: 64, fontSize: 40 }]}
              />
              <T size={14}>What needs to fit around it? (optional)</T>
              <TextInput
                accessibilityLabel="Fictional scheduling constraints"
                multiline
                value={profile.constraints}
                onChangeText={(text) => update('constraints', text)}
                maxLength={600}
                placeholder="For example: two evenings, ten minutes at a time"
                placeholderTextColor={theme.textSecondary}
                style={field}
              />
            </Card>
            <Button
              label="Continue"
              onPress={() =>
                Number(hours) >= 1 && Number(hours) <= 40
                  ? next()
                  : setError('Choose between 1 and 40 weekly hours.')
              }
            />
            <Button
              kind="ghost"
              label="Not sure · use 6 hours"
              onPress={() => {
                setHours('6');
                next();
              }}
            />
          </>
        ) : stage === 'structure' ? (
          <>
            <T size={14} tone="textSecondary">
              This changes how the plan groups practice and chooses next
              actions.
            </T>
            <Card>
              <Chip
                label="Routine · repeat familiar sessions"
                selected={profile.structure === 'routine'}
                onPress={() =>
                  setProfile((p) => ({ ...p, structure: 'routine' }))
                }
              />
              <Chip
                label="Flexible · choose sessions as time allows"
                selected={profile.structure === 'flexible'}
                onPress={() =>
                  setProfile((p) => ({ ...p, structure: 'flexible' }))
                }
              />
            </Card>
            <Button label="Continue" onPress={next} />
            <Button
              kind="ghost"
              label="Not sure · keep it flexible"
              onPress={() => {
                setProfile((p) => ({ ...p, structure: 'flexible' }));
                next();
              }}
            />
          </>
        ) : (
          <>
            <T size={14} tone="textSecondary">
              Leave goals flexible unless the fictional scenario has a real
              target date.
            </T>
            {items.map((goal) => (
              <Card key={goal}>
                <T size={19} weight="600">
                  {goal}
                </T>
                <View
                  style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
                >
                  {(['flexible', 'byDate', 'exploration'] as const).map(
                    (kind) => (
                      <Chip
                        key={kind}
                        label={
                          kind === 'byDate'
                            ? 'By a date'
                            : kind === 'exploration'
                              ? 'Exploration'
                              : 'Flexible'
                        }
                        selected={(horizons[goal]?.kind ?? 'flexible') === kind}
                        onPress={() =>
                          setHorizons((h) => ({ ...h, [goal]: { kind } }))
                        }
                      />
                    ),
                  )}
                </View>
                {horizons[goal]?.kind === 'byDate' ? (
                  <TextInput
                    accessibilityLabel={`Target date for ${goal}`}
                    placeholder="YYYY-MM-DD"
                    value={horizons[goal]?.date ?? ''}
                    onChangeText={(date) =>
                      setHorizons((h) => ({
                        ...h,
                        [goal]: { kind: 'byDate', date },
                      }))
                    }
                    style={[field, { minHeight: 54 }]}
                  />
                ) : null}
              </Card>
            ))}
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: confirmed }}
              onPress={() => setConfirmed(!confirmed)}
              style={{ paddingVertical: 12 }}
            >
              <T tone="accent">
                {confirmed ? '✓' : '○'} These are fictional demo answers
              </T>
            </Pressable>
            <T size={12} tone="textSecondary">
              Saved with this demo draft. Activating it updates the shared demo
              profile. No account privacy.
            </T>
            <Button
              label="Create demo route"
              busy={busy}
              disabled={!confirmed}
              onPress={build}
            />
          </>
        )}
        {error ? <T tone="unrealistic">{error}</T> : null}
      </MotionGroup>
    </Screen>
  );
}
