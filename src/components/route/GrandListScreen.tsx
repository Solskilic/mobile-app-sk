import { useMutation } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { BackLink, Button, Card, Chip, Screen, T } from '@/components/goal-ui';
import { useTheme } from '@/hooks/use-theme';
import { useToday } from '@/hooks/use-today';
import { DEVICE_ID } from '@/lib/plan';
import { api } from '../../../convex/_generated/api';
import { DEDICATION_LABEL, type Dedication } from '../../../convex/routeEngine';
import { MotionGroup, StepStrip } from '@/components/route-graphics';

type Horizon = { kind: 'flexible' | 'byDate' | 'exploration'; date?: string };

export default function GrandListScreen() {
  const today = useToday();
  const theme = useTheme();
  const create = useMutation(api.route.create);
  const [input, setInput] = useState('');
  const [level, setLevel] = useState<Dedication>('steady');
  const [hours, setHours] = useState('6');
  const [step, setStep] = useState(0);
  const [horizons, setHorizons] = useState<Record<string, Horizon>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [career, setCareer] = useState({
    background: '',
    location: '',
    targetRole: '',
  });
  const isCareer =
    /investment bank|career|pivot|change.*(?:job|field)|become.*(?:analyst|associate)/i.test(
      input,
    );
  const items = input
    .split(/[\n;]+/)
    .map((s) => s.replace(/^[-•]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 20);
  const field = {
    color: theme.text,
    fontSize: 18,
    lineHeight: 26,
    paddingVertical: 12,
    minHeight: 56,
  };
  async function build() {
    setError(null);
    if (
      !Number.isFinite(Number(hours)) ||
      Number(hours) < 1 ||
      Number(hours) > 40
    ) {
      setError('Choose between 1 and 40 hours a week.');
      return;
    }
    if (
      items.some(
        (goal) =>
          horizons[goal]?.kind === 'byDate' &&
          !/^\d{4}-\d{2}-\d{2}$/.test(horizons[goal].date ?? ''),
      )
    ) {
      setError('Add a date as YYYY-MM-DD, or choose a flexible horizon.');
      return;
    }
    setBusy(true);
    try {
      const routeId = await create({
        deviceId: DEVICE_ID,
        input,
        dedication: level,
        weeklyHours: Number(hours),
        today,
        goalHorizons: items.map((goal) => ({
          goal,
          horizon: horizons[goal] ?? { kind: 'flexible' },
        })),
        ...(isCareer ? { careerContext: career } : {}),
      });
      router.replace({ pathname: '/goals/route', params: { routeId } });
    } catch {
      setError(
        'Couldn’t create the route. Check your dates and connection, then retry.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <MotionGroup key={step}>
        {step > 0 ? <BackLink onPress={() => setStep(step - 1)} /> : null}
        <StepStrip total={isCareer ? 4 : 3} current={step} />
        {step === 0 ? (
          <>
            <T size={12} tone="textSecondary" weight="600">
              NEW GOALS
            </T>
            <T size={38} weight="600">
              What do you want to change?
            </T>
            <T tone="textSecondary" size={18}>
              Enter one goal or add one per line.
            </T>
            <Card>
              <TextInput
                accessibilityLabel="What do you want to change?"
                multiline
                maxLength={6000}
                value={input}
                onChangeText={setInput}
                placeholder={
                  'Run a marathon\nMake friends in Seattle\nPractise drawing'
                }
                placeholderTextColor={theme.textSecondary}
                style={[field, { minHeight: 190, textAlignVertical: 'top' }]}
              />
            </Card>
            <Button
              label="Continue  →"
              disabled={!input.trim()}
              onPress={() => setStep(1)}
            />
            <T size={12} tone="textSecondary">
              OR START WITH AN EXAMPLE PROMPT
            </T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {[
                ['Career pivot', 'I want to pivot to investment banking.'],
                [
                  'Half marathon',
                  'Train for my first half marathon, starting from comfortable 5K runs\nMake friends in Seattle through a regular group activity',
                ],
                [
                  'Learn an instrument',
                  'Learn guitar as a complete beginner. Play my first simple song. I can practise for ten minutes at a time.',
                ],
              ].map(([label, text]) => (
                <Chip
                  key={label}
                  label={label}
                  onPress={() => setInput(text)}
                />
              ))}
            </View>
            <T size={12} tone="textSecondary">
              Single-user demo with shared state and no sign-in. Don’t enter
              sensitive information.
            </T>
          </>
        ) : step === 1 ? (
          <>
            <T size={12} tone="textSecondary" weight="600">
              WEEKLY CAPACITY
            </T>
            <T size={36} weight="600">
              Dedication and time
            </T>
            <Card>
              <T weight="600">Your dedication</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {(['casual', 'steady', 'allIn'] as const).map((d) => (
                  <Chip
                    key={d}
                    label={DEDICATION_LABEL[d]}
                    selected={level === d}
                    onPress={() => setLevel(d)}
                  />
                ))}
              </View>
            </Card>
            <Card>
              <T weight="600">Hours in a normal week</T>
              <TextInput
                accessibilityLabel="Available hours per week"
                keyboardType="decimal-pad"
                value={hours}
                onChangeText={setHours}
                style={[field, { fontSize: 36 }]}
              />
              <T size={13} tone="textSecondary">
                Total hours across all goals.
              </T>
            </Card>
            <Button
              label="Continue to goal timing  →"
              onPress={() => {
                if (
                  !Number.isFinite(Number(hours)) ||
                  Number(hours) < 1 ||
                  Number(hours) > 40
                )
                  setError('Choose between 1 and 40 hours.');
                else {
                  setError(null);
                  setStep(2);
                }
              }}
            />
          </>
        ) : step === 2 ? (
          <>
            <T size={12} tone="textSecondary" weight="600">
              GOAL TIMING
            </T>
            <T size={36} weight="600">
              Time horizons
            </T>
            <T tone="textSecondary">Choose a date only when you have one.</T>
            {items.map((goal) => {
              const horizon = horizons[goal] ?? { kind: 'flexible' };
              return (
                <Card key={goal}>
                  <T size={19} weight="600">
                    {goal}
                  </T>
                  <View
                    style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
                  >
                    {(
                      [
                        { kind: 'flexible', label: 'Flexible' },
                        { kind: 'byDate', label: 'By a date' },
                        { kind: 'exploration', label: 'Exploration' },
                      ] as const
                    ).map((h) => (
                      <Chip
                        key={h.kind}
                        label={h.label}
                        selected={horizon.kind === h.kind}
                        onPress={() =>
                          setHorizons((old) => ({
                            ...old,
                            [goal]: { kind: h.kind },
                          }))
                        }
                      />
                    ))}
                  </View>
                  {horizon.kind === 'byDate' ? (
                    <TextInput
                      accessibilityLabel={`Date for ${goal}`}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={theme.textSecondary}
                      value={horizon.date ?? ''}
                      onChangeText={(date) =>
                        setHorizons((old) => ({
                          ...old,
                          [goal]: { kind: 'byDate', date },
                        }))
                      }
                      style={field}
                    />
                  ) : null}
                </Card>
              );
            })}
            <Button
              label={isCareer ? 'Add career background  →' : 'Map my route  →'}
              busy={busy}
              onPress={() => (isCareer ? setStep(3) : build())}
            />
            <T size={12} tone="textSecondary">
              Current-season questions follow the route draft.
            </T>
          </>
        ) : (
          <>
            <T size={12} tone="textSecondary" weight="600">
              CAREER CONTEXT
            </T>
            <T size={36} weight="600">
              Career background
            </T>
            <T tone="textSecondary">Enter “not sure” for unknown details.</T>
            {(
              [
                {
                  key: 'background',
                  title: 'Your background & seniority',
                  placeholder:
                    'Studies, current role, experience and tools you know',
                },
                {
                  key: 'location',
                  title: 'Where would you work?',
                  placeholder:
                    'City / country, and any work-authorization constraints',
                },
                {
                  key: 'targetRole',
                  title: 'Which entry role?',
                  placeholder:
                    'For example: analyst, associate, or not sure yet',
                },
              ] as const
            ).map((q) => (
              <Card key={q.key}>
                <T weight="600">{q.title}</T>
                <TextInput
                  accessibilityLabel={q.title}
                  multiline
                  maxLength={1600}
                  value={career[q.key]}
                  onChangeText={(text) =>
                    setCareer((old) => ({ ...old, [q.key]: text }))
                  }
                  placeholder={q.placeholder}
                  placeholderTextColor={theme.textSecondary}
                  style={[field, { minHeight: 90, textAlignVertical: 'top' }]}
                />
              </Card>
            ))}
            <Button
              label="Map a provisional route  →"
              disabled={Object.values(career).some((s) => !s.trim())}
              busy={busy}
              onPress={build}
            />
            <T size={12} tone="textSecondary">
              The route is provisional until current entry requirements are
              checked. No hiring date is promised.
            </T>
          </>
        )}
        {error ? <T>{error}</T> : null}
      </MotionGroup>
    </Screen>
  );
}
