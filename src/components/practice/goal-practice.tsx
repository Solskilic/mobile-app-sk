import { useMutation, useQuery } from 'convex/react';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Image, TextInput, View } from 'react-native';

import { Button, Card, T, Thinking } from '@/components/goal-ui';
import { PhotoProof, ProofNote } from '@/components/practice/photo-proof';
import { useTheme } from '@/hooks/use-theme';
import { formatDay } from '@/lib/plan';
import { api } from '../../../convex/_generated/api';
import type { Doc, Id } from '../../../convex/_generated/dataModel';

function PracticeStep({ item }: { item: Doc<'practice'> }) {
  const theme = useTheme();
  const addNote = useMutation(api.practice.addNote);
  const done = useMutation(api.practice.setPracticeDone);
  const remove = useMutation(api.practice.removePractice);
  const [note, setNote] = useState('');
  const [why, setWhy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card soft>
      <T size={12} weight="700" tone="accent">
        FROM SOMETHING YOU SAVED · STOP {item.rungIndex + 1}
      </T>
      {item.status === 'fetching' ? (
        <Thinking label="Finding the useful part and turning it into practice" />
      ) : null}
      {item.status === 'needsNote' || item.status === 'failed' ? (
        <View style={{ gap: 10 }}>
          <T>
            {item.status === 'failed'
              ? "That didn't come through. Tell me one thing it teaches and we'll try again."
              : item.ask}
          </T>
          <TextInput
            accessibilityLabel="What does this teach?"
            placeholder="For example: drawing hands with simple boxes"
            placeholderTextColor={theme.textSecondary}
            value={note}
            onChangeText={setNote}
            maxLength={2000}
            multiline
            style={{
              color: theme.text,
              backgroundColor: theme.background,
              padding: 12,
              borderRadius: 8,
              minHeight: 60,
            }}
          />
          <Button
            small
            label="Make a practice step"
            disabled={!note.trim()}
            busy={busy}
            onPress={async () => {
              setBusy(true);
              try {
                await addNote({ practiceId: item._id, note });
              } catch {
                setError("That didn't save. Try again.");
              } finally {
                setBusy(false);
              }
            }}
          />
        </View>
      ) : null}
      {item.status === 'ready' ? (
        <>
          <T size={18} weight="600">
            {item.minutes} min: {item.title}
          </T>
          <T size={14}>{item.howTo}</T>
          <Button
            small
            kind="ghost"
            label={why ? 'Hide why' : 'Why this step?'}
            onPress={() => setWhy(!why)}
          />
          {why ? (
            <T size={14} tone="textSecondary">
              {item.why}
            </T>
          ) : null}
          <Button
            small
            kind="quiet"
            label={item.doneAt ? 'Done · undo' : 'I practiced this'}
            onPress={async () => {
              try {
                await done({ practiceId: item._id, done: !item.doneAt });
              } catch {
                setError("That didn't save. Try again.");
              }
            }}
          />
          <PhotoProof target={{ practiceId: item._id }} />
        </>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Button
          small
          kind="ghost"
          label={item.sourceTitle ? 'Open source' : 'Open saved link'}
          onPress={() => WebBrowser.openBrowserAsync(item.url)}
        />
        <Button
          small
          kind="ghost"
          label="Remove step"
          onPress={async () => {
            try {
              await remove({ practiceId: item._id });
            } catch {
              setError("That didn't remove. Try again.");
            }
          }}
        />
      </View>
      {item.sourceTitle ? (
        <T size={12} tone="textSecondary">
          {item.sourceTitle}
        </T>
      ) : null}
      {item.status === 'ready' ? (
        <T size={12} tone="textSecondary">
          {item.userNote
            ? 'Based on your description.'
            : item.found?.includes('Transcript:')
              ? 'Based on the available transcript.'
              : item.source === 'article'
                ? 'Based on the text available from this page.'
                : 'Based on public title and description, not a full watch.'}
        </T>
      ) : null}
      {error ? (
        <T size={13} tone="textSecondary">
          {error}
        </T>
      ) : null}
    </Card>
  );
}

export function GoalPractice({
  goalId,
  canPractice,
}: {
  goalId: Id<'goals'>;
  canPractice: boolean;
}) {
  const theme = useTheme();
  const steps = useQuery(api.practice.forGoal, { goalId });
  const proofs = useQuery(api.practice.gallery, { goalId });
  const addLink = useMutation(api.practice.addLink);
  const removeProof = useMutation(api.practice.removeProof);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <View style={{ gap: 16 }}>
      {canPractice ? (
        <Card>
          <T size={20} weight="700">
            Turn a save into a small step
          </T>
          <T size={14} tone="textSecondary">
            A tutorial you meant to try? Share the link and we&apos;ll find one
            thing to practice at your current stop.
          </T>
          <TextInput
            accessibilityLabel="Tutorial link"
            placeholder="YouTube, TikTok, or an article link"
            placeholderTextColor={theme.textSecondary}
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            maxLength={2048}
            style={{
              color: theme.text,
              backgroundColor: theme.background,
              borderWidth: 1,
              borderColor: theme.border,
              padding: 12,
              borderRadius: 8,
            }}
          />
          <Button
            label="Turn it into practice"
            busy={busy}
            disabled={!url.trim()}
            onPress={async () => {
              setBusy(true);
              setError(null);
              try {
                const result = await addLink({ goalId, url });
                if (result === 'badUrl')
                  setError('Paste a full public web link.');
                else setUrl('');
              } catch {
                setError("That link didn't save. Try again.");
              } finally {
                setBusy(false);
              }
            }}
          />
          {error ? (
            <T size={13} tone="textSecondary">
              {error}
            </T>
          ) : null}
          <Button
            small
            kind="ghost"
            label={why ? 'Hide why' : 'Why turn a save into practice?'}
            onPress={() => setWhy(!why)}
          />
          {why ? (
            <T size={13} tone="textSecondary">
              Watching can give you an idea; trying it makes it yours. We read
              what the link makes available, never pretend to have seen what we
              couldn&apos;t, and keep the step small.
            </T>
          ) : null}
        </Card>
      ) : null}
      {steps?.map((item) => (
        <PracticeStep key={item._id} item={item} />
      ))}
      <Card>
        <T size={20} weight="700">
          Your practice, over time
        </T>
        <T size={14} tone="textSecondary">
          Small attempts belong here. There&apos;s no perfect photo, and no need
          to prove yourself.
        </T>
        <PhotoProof target={{ goalId }} />
        {proofs === undefined ? (
          <Thinking label="Loading your photo journal" />
        ) : null}
        {proofs?.length === 0 ? (
          <T size={14} tone="textSecondary">
            Your first photo starts the story. Later attempts can help you
            notice what&apos;s changing.
          </T>
        ) : null}
        {proofs?.map((proof) => (
          <View
            key={proof._id}
            style={{
              gap: 10,
              borderTopColor: theme.border,
              borderTopWidth: 1,
              paddingTop: 16,
            }}
          >
            <T size={12} weight="700" tone="textSecondary">
              {formatDay(proof._creationTime)} · {proof.forTitle}
            </T>
            {proof.url ? (
              <Image
                source={{ uri: proof.url }}
                accessibilityLabel={proof.shows || 'Your progress photo'}
                style={{ width: '100%', height: 240, borderRadius: 8 }}
                resizeMode="contain"
              />
            ) : null}
            <ProofNote proof={proof} />
            <Button
              small
              kind="ghost"
              label="Remove photo"
              onPress={async () => {
                try {
                  await removeProof({ proofId: proof._id });
                } catch {
                  setError("That photo didn't remove. Try again.");
                }
              }}
            />
          </View>
        ))}
      </Card>
    </View>
  );
}
