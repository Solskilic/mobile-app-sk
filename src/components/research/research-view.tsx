import * as WebBrowser from 'expo-web-browser';
import { Children, type ComponentProps, useState } from 'react';
import { Modal, Pressable, ScrollView, TextInput, View } from 'react-native';

import { Button, Card, T as Text, Thinking } from '@/components/goal-ui';
import { useTheme } from '@/hooks/use-theme';
import type { Doc, Id } from '../../../convex/_generated/dataModel';

type Citation = Doc<'research'>['resources'][number]['sources'][number];
const plainCopy = (text: string) => text.replace(/\b\d+(?:[.,]\d+)?\s*(?:%|percent\b)/gi, '');

function T({ children, ...props }: ComponentProps<typeof Text>) {
  return <Text {...props}>{Children.map(children, (child) => typeof child === 'string'
    ? plainCopy(child)
    : child)}</Text>;
}
type Data = {
  goal: { _id: Id<'goals'>; title: string; text: string; status: string };
  run: Doc<'research'> | null;
  saved?: Doc<'research'> | null;
};

function Source({ source }: { source: Citation }) {
  const [error, setError] = useState('');
  return (
    <View style={{ gap: 3 }}>
      <Pressable accessibilityRole="link" onPress={() => {
        void WebBrowser.openBrowserAsync(source.url).catch(() => setError('This link could not open. Try again later.'));
      }}>
        <T tone="accent" size={13} style={{ textDecorationLine: 'underline' }}>{source.title} ↗</T>
      </Pressable>
      <T size={11} tone="textSecondary">Checked {new Date(source.checkedAt).toLocaleDateString()} · {source.provenance}</T>
      {error ? <T size={12}>{error}</T> : null}
    </View>
  );
}

export function ResearchView({ data, busy, notice, onStart, onAdd, onRoute }: {
  data: Data;
  busy: boolean;
  notice: string;
  onStart: (profile: { background?: string; location?: string; refresh?: boolean }) => Promise<void>;
  onAdd: (researchId: Id<'research'>, key: string, weeks: number) => Promise<void>;
  onRoute: () => void;
}) {
  const theme = useTheme();
  const run = data.run;
  const [background, setBackground] = useState<string | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [whyOpen, setWhyOpen] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ key: string; title: string } | null>(null);
  const [weeks, setWeeks] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const running = run?.status === 'running';
  const result = run?.status === 'done' ? run : data.saved;
  const canAdd = data.goal.status === 'active' || data.goal.status === 'paused';
  const input = { color: theme.text, borderColor: theme.border, borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16 };
  const toggleWhy = (key: string) => setWhyOpen((old) => old === key ? null : key);
  const choose = (key: string, title: string) => { setSelection({ key, title }); setWeeks(''); setAddError(''); };

  return (
    <>
      <View style={{ gap: 5 }}>
        <T size={13} tone="textSecondary">RESEARCH · {data.goal.title}</T>
        <T size={29} weight="700">Find your next foothold.</T>
        <T tone="textSecondary">Real sources, the skills you bring, and places to start.</T>
      </View>

      {!running && (!result || editingProfile || run?.status === 'needsBackground') ? (
        <Card>
          <T weight="700">{run?.status === 'needsBackground' ? run.question : 'Start with where you are.'}</T>
          <T size={14} tone="textSecondary">For a career or academic change, share your studies, experience and tools. Add your weekly hours, dedication and budget if you know them. Only share what you want used in this research.</T>
          <TextInput
            accessibilityLabel="Your background"
            placeholder="For example: Biology graduate, lab research, Excel and a little Python. New to design. Four hours a week, free options first."
            placeholderTextColor={theme.textSecondary}
            value={background ?? run?.background ?? ''}
            onChangeText={setBackground}
            multiline
            maxLength={3000}
            style={[input, { minHeight: 100, textAlignVertical: 'top' }]}
          />
          <TextInput
            accessibilityLabel="City or region"
            placeholder="City or region (optional, for local classes)"
            placeholderTextColor={theme.textSecondary}
            value={location ?? run?.location ?? ''}
            onChangeText={setLocation}
            maxLength={120}
            style={input}
          />
          <Button
            label={result ? 'Research again' : run?.status === 'needsBackground' ? 'Use my background' : 'Find sources for my route'}
            busy={busy}
            onPress={async () => {
              await onStart({ background: background ?? run?.background, location: location ?? run?.location, refresh: !!result });
              setEditingProfile(false);
            }}
          />
          <T size={12} tone="textSecondary">We search because current requirements change. Results stay saved; fresh searches are limited so this stays useful, not endless.</T>
        </Card>
      ) : running ? (
        <Card>
          <Thinking label={plainCopy(run.steps.at(-1)?.text ?? 'Researching your route')} />
          <T size={13} tone="textSecondary">You can leave this screen. The research keeps going and your results will be here.</T>
          {run.steps.slice(-6, -1).map((s, i) => <T key={`${s.at}-${i}`} size={12} tone="textSecondary">{s.text}</T>)}
        </Card>
      ) : <Button kind="quiet" label="Update my background or search again" onPress={() => setEditingProfile(true)} />}

      {run?.status === 'failed' ? <Card><T weight="700">Research hit a snag.</T><T size={14}>{run.error}</T><T size={12} tone="textSecondary">You can try again later. Any earlier sources are still below.</T></Card> : null}
      {notice ? <Card soft><T>{notice}</T><Button small kind="quiet" label="See my route" onPress={onRoute} /></Card> : null}

      <Modal visible={!!selection && !!result} transparent animationType="fade" onRequestClose={() => setSelection(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
        {selection && result ? <Card style={{ width: '100%', maxWidth: 440 }}>
          <T weight="700">Make room for: {selection.title}</T>
          <T size={14}>How many weeks do you want to give this stop? Use your actual hours, dedication and budget. This is time you choose, not an AI promise.</T>
          <TextInput accessibilityLabel="Weeks for this stop" placeholder="Weeks, from 1 to 52" placeholderTextColor={theme.textSecondary} keyboardType="number-pad" value={weeks} onChangeText={setWeeks} style={input} />
          <T size={12} tone="textSecondary">It goes after your current stop and moves the route finish by that many weeks.</T>
          {addError ? <T>{addError}</T> : null}
          <Button label="Add this stop" busy={adding} onPress={async () => {
            const count = Number(weeks);
            if (!Number.isInteger(count) || count < 1 || count > 52) { setAddError('Choose a whole number from 1 to 52.'); return; }
            setAdding(true);
            try { await onAdd(result._id, selection.key, count); setSelection(null); }
            catch { setAddError('This stop could not be added. Try again.'); }
            finally { setAdding(false); }
          }} />
          <Button small kind="ghost" label="Not now" onPress={() => setSelection(null)} />
        </Card> : null}
          </ScrollView>
        </View>
      </Modal>

      {result ? (
        <>
          <View style={{ gap: 6 }}>
            <T weight="700">{result === run ? 'Your research' : 'Your earlier research'}</T>
            <T size={12} tone="textSecondary">Saved {new Date(result.finishedAt ?? result.startedAt).toLocaleDateString()} · Availability, prices and requirements can change.</T>
            <T>{result.summary}</T>
          </View>

          {result.occupation?.map((item) => (
            <Card key={item.source.url}>
              <T size={12} tone="textSecondary">TYPICAL OCCUPATION PATH · NOT YOUR TIMELINE</T>
              <T weight="700">{item.title}</T>
              <T size={14}>{item.typicalPath}</T>
              {item.sourceDate ? <T size={12} tone="textSecondary">Source date: {item.sourceDate}</T> : null}
              <Source source={item.source} />
            </Card>
          ))}

          {result.gaps.length ? <T size={22} weight="700">What you bring. What to build.</T> : null}
          {result.gaps.map((gap) => (
            <Card key={gap.key}>
              <T size={12} weight="700" tone={gap.status === 'have' ? 'accent' : 'textSecondary'}>{gap.status === 'have' ? 'HAVE' : gap.status === 'partial' ? 'PARTIAL' : 'MISSING'}</T>
              <T size={19} weight="700">{gap.skill}</T>
              <Button small kind="ghost" label={whyOpen === gap.key ? 'Hide why' : 'Why this skill?'} onPress={() => toggleWhy(gap.key)} />
              {whyOpen === gap.key ? <T size={14}>{gap.why}</T> : null}
              {gap.sources.map((source) => <Source key={source.url} source={source} />)}
              {gap.status !== 'have' && canAdd ? <Button small kind="quiet" label={result.addedKeys.includes(gap.key) ? 'Already on your route' : 'Make this a stop'} disabled={result.addedKeys.includes(gap.key)} onPress={() => choose(gap.key, gap.stopTitle)} /> : null}
            </Card>
          ))}

          <T size={22} weight="700">Places to start</T>
          {result.resources.length === 0 ? <T tone="textSecondary">No resource links passed the checks this time. Try another search later.</T> : null}
          {result.resources.map((resource) => (
            <Card key={resource.key}>
              <T size={12} tone="textSecondary">{resource.kind.toUpperCase()} · {resource.provider}</T>
              <T size={19} weight="700">{resource.title}</T>
              <T size={13} tone="textSecondary">{resource.price || 'Price not listed'} · {resource.duration || 'Duration not listed'}</T>
              <T size={13} tone="accent">Helps with {resource.forGap}</T>
              <Button small kind="ghost" label={whyOpen === resource.key ? 'Hide why' : 'Why this resource?'} onPress={() => toggleWhy(resource.key)} />
              {whyOpen === resource.key ? <T size={14}>{resource.why}</T> : null}
              {resource.sources.map((source) => <Source key={source.url} source={source} />)}
              {canAdd ? <Button small kind="quiet" label={result.addedKeys.includes(resource.key) ? 'Already on your route' : 'Make this a stop'} disabled={result.addedKeys.includes(resource.key)} onPress={() => choose(resource.key, resource.title)} /> : null}
            </Card>
          ))}

          {result.postings.length ? <T size={22} weight="700">What employers asked for</T> : null}
          {result.postings.map((posting) => (
            <Card key={posting.url}>
              <T weight="700">{posting.title} · {posting.company}</T>
              <T size={13} tone="textSecondary">{posting.location}{posting.postedDate ? ` · Posted ${posting.postedDate}` : ' · Posting date not listed'}</T>
              <T size={14}>{posting.requirements.join(' · ')}</T>
              <T size={13} tone="textSecondary">Recruiting timing · {posting.recruitingTiming ?? 'Not verified; check the employer page.'}</T>
              <Source source={posting.source} />
            </Card>
          ))}

          <Card>{result.notes?.map((note, index) => <T key={index} size={12} tone="textSecondary">{note}</T>)}</Card>
        </>
      ) : null}
    </>
  );
}
