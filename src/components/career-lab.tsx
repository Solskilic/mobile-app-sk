import { useConvexConnectionState, useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode, type ComponentRef } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../convex/_generated/api';
import type { Answers, CareerPath } from '../../convex/careerTypes';
import { comparison, EMPTY, EXAMPLE, workSample } from '@/lib/career';

const C = { ink: '#29291F', muted: '#6C6A59', paper: '#F8F4E9', card: '#FFFCF4', line: '#DCD7C6', mustard: '#D9AF36', pale: '#EFE3B6', green: '#465B42' };
function Copy({ children, size = 16, muted = false, bold = false }: { children: ReactNode; size?: number; muted?: boolean; bold?: boolean }) { return <Text style={{ fontSize: size, lineHeight: size * 1.38, color: muted ? C.muted : C.ink, fontWeight: bold ? '600' : '400' }}>{children}</Text>; }
function Button({ title, onPress, quiet = false, disabled = false }: { title: string; onPress: () => void; quiet?: boolean; disabled?: boolean }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, quiet && s.quiet, { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}><Copy bold>{title}</Copy></Pressable>; }
function Card({ children, gold = false }: { children: ReactNode; gold?: boolean }) { return <View style={[s.card, gold && { backgroundColor: C.pale, borderColor: C.pale }]}>{children}</View>; }
function Field({ value, onChangeText, placeholder, label, long = true }: { value: string; onChangeText: (s: string) => void; placeholder: string; label: string; long?: boolean }) { return <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#86816E" multiline={long} maxLength={long ? 8000 : 1600} textAlignVertical="top" style={[s.field, !long && { minHeight: 70 }]} />; }
function Reveal({ children, name }: { children: ReactNode; name: string }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then(reduce => { if (!cancelled && !reduce) { opacity.setValue(0); Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start(); } }).catch(() => {});
    return () => { cancelled = true; opacity.stopAnimation(); };
  }, [name, opacity]);
  return <Animated.View style={{ opacity, gap: 22 }}>{children}</Animated.View>;
}

export default function CareerLab() {
  const lab = useQuery(api.career.get);
  const ensure = useMutation(api.career.ensure);
  const saveAnswers = useMutation(api.career.saveAnswers);
  const research = useMutation(api.career.research);
  const choose = useMutation(api.career.choose);
  const saveWork = useMutation(api.career.saveWork);
  const reflect = useMutation(api.career.reflect);
  const connection = useConvexConnectionState();
  const params = useLocalSearchParams<{ view?: string }>();
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [step, setStep] = useState(0);
  const [editing, setEditing] = useState(false);
  const [artifact, setArtifact] = useState('');
  const [feeling, setFeeling] = useState<'energizing' | 'mixed' | 'draining'>('mixed');
  const [surprise, setSurprise] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const hydrated = useRef(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const view = params.view ?? 'home';
  const offline = !connection.isWebSocketConnected;
  useEffect(() => { ensure({}).catch(() => setError('Couldn’t open the lab. Check your connection and retry.')); }, [ensure]);
  useEffect(() => { if (lab && !hydrated.current) { setAnswers(lab.answers); setStep(lab.step); setArtifact(lab.artifact); hydrated.current = true; } }, [lab]);
  useEffect(() => { if (lab) setArtifact(lab.artifact); }, [lab?.artifact, lab?.selected, lab?.revision]);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [view, step]);
  const go = (next: string) => { setError(''); router.push({ pathname: '/', params: { view: next } }); };
  async function act(fn: () => Promise<unknown>) { if (offline) { setError('You’re offline. Reconnect to save; what you’ve typed stays here.'); return; } setBusy(true); setError(''); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message.replace(/.*Uncaught Error: /s, '').split('\n')[0] : 'That didn’t save. Try again.'); } finally { setBusy(false); } }
  const path = lab?.selected !== undefined ? lab.paths[lab.selected] : undefined;
  const sample = path ? workSample(path.kind) : null;
  const onboarding = editing || !lab || (lab.status === 'draft' && lab.paths.length === 0);
  const questionKeys: (keyof Answers)[] = ['dilemma', 'energy', 'drain', 'constraints'];
  const key = questionKeys[Math.min(step, 3)];
  const questions = ['What do you want to change?', 'When did work feel good?', 'What took more than it gave?', 'What needs to stay true?'];
  const hints = ['Tell us the career decision on your mind. Two paths are enough.', `Think of one moment, not a job title${/biology|lab|science/i.test(answers.dilemma) ? ' — in a lab, a class, or outside both' : ''}. What were you doing?`, `You mentioned “${answers.energy.slice(0, 65)}${answers.energy.length > 65 ? '…' : ''}”. Now think of a draining experience.`, 'Location, time each week, money, and non-negotiables. Contradictions are welcome.'];
  const placeholders = ['I studied biology. UX or science communication?', 'I loved explaining our project to visitors…', 'Working alone on the same protocol all day…', 'US · 4 hours/week · no paid training yet · remote matters'];
  const updated = lab ? comparison(lab.paths, lab.outcomes, lab.revision) : [];
  const currentOutcomes = lab?.outcomes.filter(o => o.revision === lab.revision) ?? [];
  const nextIndex = lab?.paths.findIndex((_p, i) => !currentOutcomes.some(o => o.path === i)) ?? 0;
  const isResearching = lab?.status === 'researching';
  const head = <View style={s.top}><Pressable accessibilityRole="button" onPress={() => { setEditing(false); go('home'); }}><Text style={s.brand}>fieldwork<Text style={{ color: '#9F771A' }}>↗</Text></Text></Pressable><View style={s.badge}><Copy size={10} bold>SINGLE-USER DEMO</Copy></View></View>;
  return <SafeAreaView style={s.safe}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={s.page}>
    {head}
    {offline ? <View style={s.notice}><Copy size={13}>Connecting / offline · saved evidence stays visible. New saves need a connection.</Copy></View> : null}
    {error ? <View accessibilityRole="alert" style={s.notice}><Copy size={14}>{error}</Copy></View> : null}
    {onboarding ? <Reveal name={`question-${step}`}>
      <View style={s.progress}>{[0, 1, 2, 3].map(i => <View key={i} style={[s.segment, i <= step && { backgroundColor: C.mustard }]} />)}</View>
      <Copy size={12} muted bold>YOUR NEXT CHAPTER · {Math.min(step + 1, 4)} OF 4</Copy>
      <Copy size={38}>{questions[Math.min(step, 3)]}</Copy>
      {step === 0 ? <Copy size={19}>Try the work before you bet your life on it.</Copy> : null}
      <Copy muted>{hints[Math.min(step, 3)]}</Copy>
      <Field value={answers[key]} onChangeText={value => setAnswers(a => ({ ...a, [key]: value.slice(0, 1600) }))} placeholder={placeholders[Math.min(step, 3)]} label={questions[Math.min(step, 3)]} />
      {step === 3 ? <><Copy muted size={13}>Optional: paste context from a personality test. It’s context, never a score or a reason to rule a path out.</Copy><Field value={answers.context} onChangeText={value => setAnswers(a => ({ ...a, context: value.slice(0, 1600) }))} placeholder="Only what you want us to consider" label="Optional personal context" long={false} /></> : null}
      <Button disabled={busy || !lab || !answers[key].trim()} title={step < 3 ? 'Continue  →' : 'Find my two paths  →'} onPress={() => act(async () => { await saveAnswers({ answers, step: Math.min(step + 1, 3) }); if (step < 3) setStep(step + 1); else { await research({}); setEditing(false); go('compare'); } })} />
      {step > 0 ? <Button quiet title="Back" onPress={() => setStep(step - 1)} /> : <Button quiet disabled={!lab || busy} title="Use a biology → two paths example" onPress={() => { setAnswers(EXAMPLE); }} />}
      <Copy size={12} muted>No test can tell you who to become. Let’s collect better evidence. This shared demo has no sign-in; don’t enter sensitive information.</Copy>
    </Reveal> : isResearching && !lab.paths.length ? <Reveal name="researching"><Copy size={36}>Two paths. Real sources.</Copy><ActivityIndicator color={C.ink} /><Copy>Reading official career task descriptions and checking the exact quotes.</Copy><Copy muted size={14}>Your answers are saved. This can take a couple of minutes. No paid training, salary guesses, or personality scores.</Copy><Button quiet title="Return to my dilemma" onPress={() => go('home')} /></Reveal> : view === 'compare' || (!lab?.paths.length && !onboarding) ? <Reveal name="compare">
      <Copy size={12} muted bold>TWO POSSIBILITIES, NOT A VERDICT</Copy><Copy size={36}>Which work would you try?</Copy>
      <Copy muted>{lab?.answers.dilemma}</Copy>
      {lab?.error ? <Card><Copy>{lab.error}</Copy></Card> : null}
      {lab?.paths.map((p, i) => <Card key={`${p.title}-${i}`} gold={lab.selected === i}><Copy size={12} bold>PATH {i + 1} · 20-MINUTE TRIAL</Copy><Copy size={26}>{p.title}</Copy><Copy><Text style={s.bold}>Possible upside · </Text>{p.upside}</Copy><Copy><Text style={s.bold}>Possible cost · </Text>{p.cost}</Copy><Copy muted><Text style={s.bold}>Still unknown · </Text>{p.unknown}</Copy><Copy size={14}>{updated[i]?.change}</Copy><Button disabled={busy} title={`Try ${i === 0 ? 'this' : 'the other'} work  →`} onPress={() => act(async () => { await choose({ path: i, revision: lab.revision }); setSurprise(''); setFeeling('mixed'); go('work'); })} /></Card>)}
      <Button quiet disabled={busy || isResearching} title={isResearching ? 'Checking fresh sources…' : lab?.paths.length ? 'Refresh dated sources' : 'Retry official research'} onPress={() => act(() => research({ refresh: true }))} />
      <Button quiet title="See the evidence" onPress={() => go('ledger')} /><Button quiet title="Change my answers" onPress={() => { setAnswers(lab?.answers ?? EMPTY); setStep(0); setEditing(true); }} />
    </Reveal> : view === 'work' && path && sample ? <Reveal name={`work-${lab?.selected}`}>
      <Copy size={12} muted bold>{path.title.toUpperCase()} · SAFE WORK SAMPLE</Copy><Copy size={36}>{sample.title}</Copy>
      <View style={s.time}><Copy size={42} bold>20</Copy><Copy size={15}>minutes · $0 · right here</Copy></View>
      <Copy size={13} muted>A tiny approximation, not a career assessment. Use a fictional brief; no real clients or private data. If 20 minutes doesn’t fit today, save it for later.</Copy>
      <Card><Copy>{sample.brief}</Copy></Card>
      {sample.steps.map(t => <Copy key={t}>{t}</Copy>)}
      <Field value={artifact} onChangeText={setArtifact} placeholder={sample.placeholder} label="Your work sample" />
      <Button quiet disabled={busy} title="Save draft for later" onPress={() => act(async () => { await saveWork({ artifact, path: lab!.selected!, revision: lab!.revision }); go('home'); })} />
      <Button disabled={busy || artifact.trim().length < 30} title="I tried it. Reflect  →" onPress={() => act(async () => { await saveWork({ artifact, path: lab!.selected!, revision: lab!.revision }); go('reflect'); })} />
      <Button quiet title="Choose the other path" onPress={() => go('compare')} />
    </Reveal> : view === 'reflect' && path ? <Reveal name="reflect"><Copy size={12} muted bold>AFTER THE WORK · {path.title.toUpperCase()}</Copy><Copy size={36}>How did that feel?</Copy><Copy muted>There isn’t a right answer. One sample is a clue, not a conclusion.</Copy>
      {(['energizing', 'mixed', 'draining'] as const).map(f => <Pressable accessibilityRole="radio" accessibilityState={{ checked: feeling === f }} key={f} style={[s.option, feeling === f && { backgroundColor: C.pale, borderColor: C.ink }]} onPress={() => setFeeling(f)}><Copy bold>{feeling === f ? '●' : '○'}  {f[0].toUpperCase() + f.slice(1)}</Copy></Pressable>)}
      <Copy size={22}>What surprised you?</Copy><Field value={surprise} onChangeText={v => setSurprise(v.slice(0, 1600))} label="What surprised you?" placeholder="I expected… but I noticed…" />
      <Button disabled={busy || surprise.trim().length < 3} title="Update my comparison  →" onPress={() => act(async () => { await reflect({ path: lab!.selected!, revision: lab!.revision, feeling, surprise }); go('ledger'); })} />
    </Reveal> : view === 'ledger' ? <Reveal name="ledger"><Copy size={12} muted bold>YOUR EVIDENCE, IN ORDER</Copy><Copy size={36}>What changed?</Copy><Copy muted>No hidden score. Your experience changes the comparison, not your identity.</Copy>
      {lab?.paths.map((p, i) => <Evidence key={`${p.title}-${i}`} path={p} statement={lab.answers.energy} change={updated[i]?.change ?? ''} next={updated[i]?.next ?? ''} outcomes={currentOutcomes.filter(o => o.path === i).map(o => ({ feeling: o.feeling, surprise: o.surprise, artifact: o.artifact }))} />)}
      {lab?.outcomes.some(o => o.revision !== lab.revision) ? <Copy size={13} muted>Earlier trials are retained, but aren’t applied to this revised dilemma.</Copy> : null}
      <Button title="Back to my next experiment  →" onPress={() => go('home')} /><Button quiet title="Compare the paths" onPress={() => go('compare')} />
    </Reveal> : <Reveal name="home"><Copy size={12} muted bold>YOUR DECISION LAB</Copy><Copy size={38}>{currentOutcomes.length ? 'A little less guessing.' : 'You don’t have to decide today.'}</Copy><Copy size={19}>{lab?.answers.dilemma}</Copy>
      {lab?.error ? <Card><Copy size={14}>{lab.error}</Copy><Button quiet title="Open saved comparison / retry" onPress={() => go('compare')} /></Card> : null}
      {lab?.paths.length ? <Card gold><Copy size={12} bold>YOUR NEXT EXPERIMENT</Copy><Copy size={26}>{nextIndex >= 0 ? lab.paths[nextIndex].title : 'Try a different slice of the work'}</Copy><Copy>{path && !currentOutcomes.some(o => o.path === lab.selected) ? workSample(path.kind).title : nextIndex >= 0 ? workSample(lab.paths[nextIndex].kind).title : 'Compare what gave you energy and what didn’t. A single trial doesn’t settle a career.'}</Copy><Copy size={22} bold>20 min · $0</Copy><Button disabled={busy} title={path && !currentOutcomes.some(o => o.path === lab.selected) ? 'Continue my work sample  →' : 'Choose a work sample  →'} onPress={() => go(path && !currentOutcomes.some(o => o.path === lab.selected) ? 'work' : 'compare')} /></Card> : null}
      <Button quiet title="Compare my two paths" onPress={() => go('compare')} /><Button quiet title={`My evidence${currentOutcomes.length ? ` · ${currentOutcomes.length} real trial${currentOutcomes.length > 1 ? 's' : ''}` : ''}`} onPress={() => go('ledger')} />
      <Copy size={12} muted>Single-user demo · shared saved state · no sign-in. Not a professional career assessment.</Copy>
    </Reveal>}
    {busy ? <ActivityIndicator color={C.ink} /> : null}
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

function Evidence({ path, statement, change, next, outcomes }: { path: CareerPath; statement: string; change: string; next: string; outcomes: { feeling: string; surprise: string; artifact: string }[] }) {
  return <Card><Copy size={25}>{path.title}</Copy><Copy size={11} muted bold>01 · YOU SAID</Copy><Copy>“{statement}”</Copy><Copy size={11} muted bold>02 · WORKING HYPOTHESIS</Copy><Copy>{path.hypothesis}</Copy><Copy size={11} muted bold>03 · CITED CAREER TASK</Copy><Copy>“{path.source.quote}”</Copy><Pressable accessibilityRole="link" onPress={() => Linking.openURL(path.source.url).catch(() => {})}><Copy size={13} bold>{path.source.title} ↗</Copy></Pressable><Copy size={12} muted>{path.source.geography}{'\n'}Checked {new Date(path.source.checkedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · publication date not verified</Copy><Copy size={11} muted bold>04 · YOUR EXPERIMENT</Copy>{outcomes.length ? outcomes.map((o, i) => <View key={i} style={{ gap: 8 }}><Copy bold>{o.feeling} · real user reflection</Copy><Copy>“{o.surprise}”</Copy><Copy size={13} muted>{o.artifact}</Copy></View>) : <Copy muted>Not tried yet. No outcome has been simulated.</Copy>}<Copy size={11} muted bold>05 · UPDATED COMPARISON</Copy><Copy>{change}</Copy><Copy muted size={14}>{next}</Copy></Card>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.paper }, page: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 42, gap: 24, width: '100%', maxWidth: 560, alignSelf: 'center' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }, brand: { fontSize: 25, fontWeight: '700', letterSpacing: -1, color: C.ink }, badge: { paddingVertical: 6, paddingHorizontal: 8, borderWidth: 1, borderColor: C.line, borderRadius: 20 },
  button: { minHeight: 56, borderRadius: 18, backgroundColor: C.mustard, alignItems: 'center', justifyContent: 'center', padding: 16 }, quiet: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.line },
  card: { borderRadius: 24, padding: 22, gap: 15, backgroundColor: C.card, borderWidth: 1, borderColor: C.line }, field: { fontSize: 18, lineHeight: 27, color: C.ink, backgroundColor: C.card, padding: 18, borderRadius: 18, borderWidth: 1, borderColor: C.line, minHeight: 165 },
  progress: { flexDirection: 'row', gap: 6 }, segment: { flex: 1, height: 4, backgroundColor: C.line, borderRadius: 3 }, bold: { fontWeight: '600' }, notice: { backgroundColor: C.pale, padding: 14, borderRadius: 14 }, time: { flexDirection: 'row', alignItems: 'center', gap: 14 }, option: { padding: 18, borderWidth: 1, borderColor: C.line, borderRadius: 18 },
});
