import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { useTheme } from '@/hooks/use-theme';
import { Button, Card, T } from './goal-ui';
import { RunDistanceGraphic } from './route-graphics';

export function RunLog({ goalId }: { goalId: Id<'goals'> }) {
  const theme = useTheme();
  const runs = useQuery(api.runLog.list, { goalId });
  const add = useMutation(api.runLog.add);
  const remove = useMutation(api.runLog.remove);
  const samples = useMutation(api.runLog.addSamples);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [distance, setDistance] = useState('');
  const [minutes, setMinutes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function perform(work: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
      setNotice(success);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Couldn’t save this change. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = {
    color: theme.text,
    backgroundColor: theme.background,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
  };
  const manual = runs?.filter((run) => run.provenance === 'manual') ?? [];
  const sample = runs?.filter((run) => run.provenance === 'sample') ?? [];

  return (
    <Card>
      <T size={21} weight="700">
        Your run log
      </T>
      <RunDistanceGraphic runs={manual} />
      <T size={13} tone="textSecondary">
        Fictional manual entries · shared demo, no account privacy.
      </T>
      <T size={14} tone="textSecondary">
        Enter a sample run. Logs never complete a task, milestone or race.
      </T>
      <T size={13}>Run date (YYYY-MM-DD, UTC)</T>
      <TextInput
        accessibilityLabel="Run date, YYYY-MM-DD, UTC"
        value={date}
        onChangeText={setDate}
        editable={!busy}
        autoCapitalize="none"
        maxLength={10}
        placeholder="2026-11-15"
        placeholderTextColor={theme.textSecondary}
        style={inputStyle}
      />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <T size={13}>Distance (km)</T>
          <TextInput
            accessibilityLabel="Run distance in kilometres"
            value={distance}
            onChangeText={setDistance}
            editable={!busy}
            keyboardType="decimal-pad"
            placeholder="5.0"
            placeholderTextColor={theme.textSecondary}
            style={inputStyle}
          />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <T size={13}>Moving minutes</T>
          <TextInput
            accessibilityLabel="Moving time in minutes"
            value={minutes}
            onChangeText={setMinutes}
            editable={!busy}
            keyboardType="decimal-pad"
            placeholder="30"
            placeholderTextColor={theme.textSecondary}
            style={inputStyle}
          />
        </View>
      </View>
      <Button
        label="Save manual run"
        disabled={busy || !distance.trim() || !minutes.trim() || !date.trim()}
        onPress={() =>
          perform(async () => {
            await add({
              goalId,
              date: date.trim(),
              distanceKm: Number(distance.replace(',', '.')),
              movingMinutes: Number(minutes.replace(',', '.')),
            });
            setDistance('');
            setMinutes('');
          }, 'Manual run saved.')
        }
      />
      {error ? (
        <T size={13} tone="unrealistic">
          {error}
        </T>
      ) : null}
      {notice ? (
        <T size={13} tone="textSecondary">
          {notice}
        </T>
      ) : null}
      {runs === undefined ? (
        <T size={14} tone="textSecondary">
          Loading runs…
        </T>
      ) : manual.length === 0 ? (
        <T size={14} tone="textSecondary">
          No manual runs yet.
        </T>
      ) : (
        <T size={14} weight="700">
          Manual runs
        </T>
      )}
      {manual.map((run) => (
        <View
          key={run._id}
          style={{
            gap: 4,
            borderTopWidth: 1,
            borderColor: theme.border,
            paddingTop: 12,
          }}
        >
          <T size={14} weight="600">
            {run.date} · {(run.distance / 1000).toLocaleString()} km ·{' '}
            {Math.round(run.movingTime / 60)} min
          </T>
          <T size={12} tone="textSecondary">
            Manual · self-reported
          </T>
          <Button
            label={`Remove run from ${run.date}`}
            kind="ghost"
            small
            disabled={busy}
            onPress={() =>
              perform(() => remove({ goalId, runId: run._id }), 'Run removed.')
            }
          />
        </View>
      ))}
      {sample.length ? (
        <>
          <T size={14} weight="700">
            Sample runs · illustrative only
          </T>
          <T size={13} tone="textSecondary">
            These aren’t your runs and never change your route or re-entry.
          </T>
          {sample.map((run) => (
            <View key={run._id} style={{ gap: 4 }}>
              <T size={14}>
                {run.date} · {(run.distance / 1000).toLocaleString()} km ·{' '}
                {Math.round(run.movingTime / 60)} min · SAMPLE
              </T>
              <Button
                label={`Remove sample from ${run.date}`}
                kind="ghost"
                small
                disabled={busy}
                onPress={() =>
                  perform(
                    () => remove({ goalId, runId: run._id }),
                    'Sample removed.',
                  )
                }
              />
            </View>
          ))}
        </>
      ) : (
        <Button
          label="Preview sample runs"
          kind="ghost"
          small
          disabled={busy || runs === undefined}
          onPress={() =>
            perform(
              () => samples({ goalId }),
              'Illustrative samples added. These never affect your route.',
            )
          }
        />
      )}
    </Card>
  );
}
