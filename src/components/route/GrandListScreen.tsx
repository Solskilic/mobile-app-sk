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
  const [career, setCareer] = useState({ background: '', location: '', targetRole: '' });
  const isCareer = /investment bank|career|pivot|change.*(?:job|field)|become.*(?:analyst|associate)/i.test(input);
  const items = input.split(/[\n;]+/).map(s => s.replace(/^[-•]\s*/, '').trim()).filter(Boolean).slice(0, 20);
  const field = { color: theme.text, fontSize: 18, lineHeight: 26, paddingVertical: 12, minHeight: 56 };
  async function build() {
    setError(null);
    if (!Number.isFinite(Number(hours)) || Number(hours) < 1 || Number(hours) > 40) { setError('Choose between 1 and 40 hours a week.'); return; }
    if (items.some(goal => horizons[goal]?.kind === 'byDate' && !/^\d{4}-\d{2}-\d{2}$/.test(horizons[goal].date ?? ''))) { setError('Add a date as YYYY-MM-DD, or choose a flexible horizon.'); return; }
    setBusy(true);
    try {
      const routeId = await create({ deviceId: DEVICE_ID, input, dedication: level, weeklyHours: Number(hours), today,
        goalHorizons: items.map(goal => ({ goal, horizon: horizons[goal] ?? { kind: 'flexible' } })), ...(isCareer ? { careerContext: career } : {}) });
      router.replace({ pathname: '/goals/route', params: { routeId } });
    } catch { setError('Couldn’t start your route. Check the dates and connection, then try again. Your list is still here.'); }
    finally { setBusy(false); }
  }
  return <Screen>
    {step > 0 ? <BackLink onPress={() => setStep(step - 1)} /> : null}
    <View style={{ flexDirection: 'row', gap: 6 }}>{[0, 1, 2].map(i => <View key={i} style={{ flex: 1, height: 4, borderRadius: 4, backgroundColor: i <= step ? '#D9AF36' : theme.border }} />)}</View>
    {step === 0 ? <>
      <T size={12} tone="textSecondary" weight="600">A LITTLE CLOSER TO YOUR NEXT LIFE</T>
      <T size={38} weight="600">What do you want to change?</T>
      <T tone="textSecondary" size={18}>One big thing. Or everything on your mind.</T>
      <Card><TextInput accessibilityLabel="What do you want to change?" multiline maxLength={6000} value={input} onChangeText={setInput} placeholder={'Run a marathon\nFind my people in Seattle\nMake room for drawing again'} placeholderTextColor={theme.textSecondary} style={[field, { minHeight: 190, textAlignVertical: 'top' }]} /></Card>
      <Button label="Find a way forward  →" disabled={!input.trim()} onPress={() => setStep(1)} />
      <T size={12} tone="textSecondary">OR START WITH AN EXAMPLE PROMPT</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[
        ['Career pivot', 'I want to pivot to investment banking.'],
        ['Half marathon', 'Train for my first half marathon, starting from comfortable 5K runs\nMake friends in Seattle through a regular group activity'],
        ['Learn an instrument', 'Learn guitar as a complete beginner. Play my first simple song. I can practise for ten minutes at a time.'],
      ].map(([label, text]) => <Chip key={label} label={label} onPress={() => setInput(text)} />)}</View>
      <T size={12} tone="textSecondary">Your whole list stays. Only a little gets your attention at once. Single-user demo with shared state and no sign-in; avoid sensitive information.</T>
    </> : step === 1 ? <>
      <T size={12} tone="textSecondary" weight="600">ROOM IN YOUR REAL LIFE</T><T size={36} weight="600">What pace feels right?</T><T tone="textSecondary">Commitment and available time are different things.</T>
      <Card><T weight="600">Your dedication</T><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{(['casual', 'steady', 'allIn'] as const).map(d => <Chip key={d} label={DEDICATION_LABEL[d]} selected={level === d} onPress={() => setLevel(d)} />)}</View><T size={13} tone="textSecondary">A preference, not a promise.</T></Card>
      <Card><T weight="600">Hours in a normal week</T><TextInput accessibilityLabel="Available hours per week" keyboardType="decimal-pad" value={hours} onChangeText={setHours} style={[field, { fontSize: 36 }]} /><T size={13} tone="textSecondary">Shared across everything. We won’t squeeze your week to meet a date.</T></Card>
      <Button label="Give each goal its own horizon  →" onPress={() => { if (!Number.isFinite(Number(hours)) || Number(hours) < 1 || Number(hours) > 40) setError('Choose between 1 and 40 hours.'); else { setError(null); setStep(2); } }} />
    </> : step === 2 ? <>
      <T size={12} tone="textSecondary" weight="600">NOT EVERYTHING NEEDS A DEADLINE</T><T size={36} weight="600">Your goals. Your timing.</T><T tone="textSecondary">One goal per line makes this easier. Untimed goals stay flexible.</T>
      {items.map(goal => { const horizon = horizons[goal] ?? { kind: 'flexible' }; return <Card key={goal}><T size={19} weight="600">{goal}</T><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{([{ kind: 'flexible', label: 'Flexible' }, { kind: 'byDate', label: 'By a date' }, { kind: 'exploration', label: 'Just exploring' }] as const).map(h => <Chip key={h.kind} label={h.label} selected={horizon.kind === h.kind} onPress={() => setHorizons(old => ({ ...old, [goal]: { kind: h.kind } }))} />)}</View>{horizon.kind === 'byDate' ? <TextInput accessibilityLabel={`Date for ${goal}`} placeholder="YYYY-MM-DD" placeholderTextColor={theme.textSecondary} value={horizon.date ?? ''} onChangeText={date => setHorizons(old => ({ ...old, [goal]: { kind: 'byDate', date } }))} style={field} /> : null}</Card>; })}
      <Button label={isCareer ? 'Start with my background  →' : 'Map my route  →'} busy={busy} onPress={() => isCareer ? setStep(3) : build()} /><T size={12} tone="textSecondary">We’ll ask about where you’re starting for this season only. Later goals can wait.</T>
    </> : <>
      <T size={12} tone="textSecondary" weight="600">BEFORE WE DRAW A CAREER ROUTE</T><T size={36} weight="600">Start from where you are.</T><T tone="textSecondary">A career title isn’t enough to know the entry path. “Not sure” is a useful answer.</T>
      {([{ key: 'background', title: 'Your background & seniority', placeholder: 'Studies, current role, experience and tools you know' }, { key: 'location', title: 'Where would you work?', placeholder: 'City / country, and any work-authorization constraints' }, { key: 'targetRole', title: 'Which entry role?', placeholder: 'For example: analyst, associate, or not sure yet' }] as const).map(q => <Card key={q.key}><T weight="600">{q.title}</T><TextInput accessibilityLabel={q.title} multiline maxLength={1600} value={career[q.key]} onChangeText={text => setCareer(old => ({ ...old, [q.key]: text }))} placeholder={q.placeholder} placeholderTextColor={theme.textSecondary} style={[field, { minHeight: 90, textAlignVertical: 'top' }]} /></Card>)}
      <Button label="Map a provisional route  →" disabled={Object.values(career).some(s => !s.trim())} busy={busy} onPress={build} /><T size={12} tone="textSecondary">We’ll distinguish skill practice, networking and applications. Current requirements need sources; a plan cannot promise a job or hiring date.</T>
    </>}
    {error ? <T>{error}</T> : null}
  </Screen>;
}
