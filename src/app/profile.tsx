import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import {
  BackLink,
  Button,
  Card,
  Chip,
  Screen,
  T,
  Thinking,
} from '@/components/goal-ui';
import { FlowReveal, MotionGroup } from '@/components/route-graphics';
import { useTheme } from '@/hooks/use-theme';
import { useToday } from '@/hooks/use-today';
import { DEMO_EXAMPLES, DEMO_NOTICE } from '@/lib/demo-profile';
import { DEVICE_ID } from '@/lib/plan';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import type { DemoProfile } from '../../convex/demoProfileTypes';

export default function ProfileScreen() {
  const profile = useQuery(api.demoProfile.get, { deviceId: DEVICE_ID });
  if (profile === undefined)
    return (
      <Screen>
        <Thinking label="Loading demo profile" />
      </Screen>
    );
  return (
    <ProfileEditor
      key={profile?._id ?? 'sample'}
      initial={profile ?? DEMO_EXAMPLES[1].profile}
      saved={profile !== null}
    />
  );
}

function ProfileEditor({
  initial,
  saved,
}: {
  initial: DemoProfile;
  saved: boolean;
}) {
  const theme = useTheme();
  const today = useToday();
  const save = useMutation(api.demoProfile.save);
  const rename = useMutation(api.goals.renameDemo);
  const goals = usePaginatedQuery(
    api.goals.history,
    { deviceId: DEVICE_ID },
    { initialNumItems: 20 },
  );
  const [form, setForm] = useState<DemoProfile>(initial);
  const [hours, setHours] = useState(String(initial.weeklyHours));
  const [editing, setEditing] = useState(!saved);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [goalEdit, setGoalEdit] = useState<Id<'goals'> | null>(null);
  const [title, setTitle] = useState('');
  const inputStyle = {
    color: theme.text,
    minHeight: 70,
    fontSize: 17,
    lineHeight: 25,
    textAlignVertical: 'top' as const,
    paddingVertical: 10,
  };
  async function commit() {
    setBusy(true);
    setNotice('');
    try {
      await save({
        deviceId: DEVICE_ID,
        fictional: true,
        startingPoint: form.startingPoint,
        motivation: form.motivation,
        constraints: form.constraints,
        structure: form.structure,
        weeklyHours: Number(hours),
        today,
        applyToActive: true,
      });
      setForm((p) => ({ ...p, weeklyHours: Number(hours) }));
      setEditing(false);
      setNotice(
        'Demo profile saved. Future steps are being updated from this context; completed work is unchanged.',
      );
    } catch {
      setNotice(
        'Couldn’t save. Use 1–40 hours and answers under 600 characters, then retry when connected.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <BackLink
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace('/')
        }
      />
      <T size={12} tone="accent" weight="700">
        FICTIONAL DEMO
      </T>
      <T size={36} weight="600">
        Demo profile
      </T>
      <T size={13} tone="textSecondary">
        {DEMO_NOTICE} This is not a private account.
      </T>
      {notice ? (
        <Card soft>
          <T size={14}>{notice}</T>
        </Card>
      ) : null}
      <Card>
        <T size={23} weight="600">
          Planning context
        </T>
        <FlowReveal open={editing}>
          <MotionGroup>
            {(['startingPoint', 'motivation', 'constraints'] as const).map(
              (key) => (
                <View key={key}>
                  <T size={14} weight="600">
                    {key === 'startingPoint'
                      ? 'Sample background & experience'
                      : key === 'motivation'
                        ? 'Sample reason for the goals'
                        : 'Sample scheduling constraints'}
                  </T>
                  <TextInput
                    accessibilityLabel={
                      key === 'startingPoint'
                        ? 'Sample background and experience'
                        : key === 'motivation'
                          ? 'Sample goal motivation'
                          : 'Sample scheduling constraints'
                    }
                    multiline
                    value={form[key]}
                    maxLength={600}
                    onChangeText={(value) =>
                      setForm((p) => ({ ...p, [key]: value }))
                    }
                    style={inputStyle}
                    placeholder="Not sure / leave blank"
                    placeholderTextColor={theme.textSecondary}
                  />
                </View>
              ),
            )}
            <T size={14}>Weekly hours across goals</T>
            <TextInput
              accessibilityLabel="Demo weekly hours"
              value={hours}
              onChangeText={setHours}
              keyboardType="decimal-pad"
              style={inputStyle}
            />
            <Chip
              label="Routine sessions"
              selected={form.structure === 'routine'}
              onPress={() => setForm((p) => ({ ...p, structure: 'routine' }))}
            />
            <Chip
              label="Flexible sessions"
              selected={form.structure === 'flexible'}
              onPress={() => setForm((p) => ({ ...p, structure: 'flexible' }))}
            />
            <T size={12} tone="textSecondary">
              Save only fictional sample answers. This updates the active demo
              route’s hours and future actions.
            </T>
            <Button
              label="Save fictional demo profile"
              busy={busy}
              onPress={commit}
            />
            <Button
              kind="ghost"
              label="Cancel edits"
              disabled={busy}
              onPress={() => {
                setForm(initial);
                setHours(String(initial.weeklyHours));
                setEditing(false);
              }}
            />
          </MotionGroup>
        </FlowReveal>
        <FlowReveal open={!editing}>
          <View style={{ gap: 14 }}>
            <T size={14}>{form.startingPoint || 'Starting point not added.'}</T>
            <T size={14} tone="textSecondary">
              {form.weeklyHours} h / week ·{' '}
              {form.structure === 'routine'
                ? 'Routine sessions'
                : 'Flexible sessions'}
            </T>
            {form.motivation ? <T size={14}>{form.motivation}</T> : null}
            {form.constraints ? (
              <T size={14} tone="textSecondary">
                {form.constraints}
              </T>
            ) : null}
            {!form.motivation || form.startingPoint === 'Not sure' ? (
              <T size={13} tone="textSecondary">
                Next profile update: add a fictional starting point or reason
                when the plan needs more context.
              </T>
            ) : null}
            <Button
              kind="quiet"
              label="Edit demo context"
              onPress={() => setEditing(true)}
            />
          </View>
        </FlowReveal>
      </Card>
      {(['current', 'paused', 'done'] as const).map((group) => (
        <Card key={group}>
          <T size={23} weight="600">
            {group === 'current'
              ? 'Current goals'
              : group === 'paused'
                ? 'Paused / later'
                : 'Completed goals'}
          </T>
          {goals.results
            .filter((g) =>
              group === 'current'
                ? g.status !== 'paused' && g.status !== 'done'
                : g.status === group,
            )
            .map((goal) => (
              <View key={goal._id} style={{ gap: 10 }}>
                {goalEdit === goal._id ? (
                  <>
                    <TextInput
                      accessibilityLabel="Fictional goal display title"
                      value={title}
                      maxLength={120}
                      onChangeText={setTitle}
                      style={inputStyle}
                    />
                    <T size={12} tone="textSecondary">
                      Renames the display title; the existing plan is unchanged.
                    </T>
                    <Button
                      small
                      label="Save title"
                      busy={busy}
                      onPress={async () => {
                        setBusy(true);
                        try {
                          await rename({
                            goalId: goal._id,
                            title,
                            fictional: true,
                          });
                          setGoalEdit(null);
                        } catch {
                          setNotice(
                            'Couldn’t rename the goal. Use 1–120 characters and retry.',
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                    <Button
                      small
                      kind="ghost"
                      label="Cancel rename"
                      onPress={() => setGoalEdit(null)}
                    />
                  </>
                ) : (
                  <>
                    <Button
                      kind="quiet"
                      label={goal.title}
                      onPress={() => router.push(`/goals/${goal._id}`)}
                    />
                    <Button
                      small
                      kind="ghost"
                      label="Rename display title"
                      onPress={() => {
                        setGoalEdit(goal._id);
                        setTitle(goal.title);
                      }}
                    />
                  </>
                )}
              </View>
            ))}
          {goals.status === 'LoadingFirstPage' ? (
            <T size={13}>Loading goals…</T>
          ) : !goals.results.some((g) =>
              group === 'current'
                ? g.status !== 'paused' && g.status !== 'done'
                : g.status === group,
            ) ? (
            <T size={13} tone="textSecondary">
              None in the loaded history.
            </T>
          ) : null}
        </Card>
      ))}
      {goals.status === 'CanLoadMore' || goals.status === 'LoadingMore' ? (
        <Button
          kind="ghost"
          label="Load earlier goals"
          busy={goals.status === 'LoadingMore'}
          onPress={() => goals.loadMore(20)}
        />
      ) : null}
      <Button
        kind="quiet"
        label="Add a fictional goal scenario"
        onPress={() => router.push('/goals/new')}
      />
    </Screen>
  );
}
