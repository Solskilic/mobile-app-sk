import { useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { BackLink, Button, Card, Chip, Screen, T, Thinking } from '@/components/goal-ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { DEVICE_ID, localDate } from '@/lib/plan';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

const EXAMPLES = ['Run 75 miles a month', 'Switch from biology to UX', 'Read 12 books this year'];

export default function NewGoalScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ goalId?: string }>();
  const [goalId, setGoalId] = useState<Id<'goals'> | null>((params.goalId as Id<'goals'>) ?? null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState<{ _id: Id<'goals'>; title: string }[] | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const add = useMutation(api.goals.add);
  const pause = useMutation(api.goals.pause);
  const answer = useMutation(api.goals.answer);
  const retry = useMutation(api.goals.retry);
  const goal = useQuery(api.goals.get, goalId ? { goalId } : 'skip');

  const input = {
    borderColor: theme.border,
    backgroundColor: theme.backgroundElement,
    color: theme.text,
  };

  const submit = async (goalText = text) => {
    setBusy(true);
    try {
      const result = await add({ deviceId: DEVICE_ID, text: goalText });
      if (result.status === 'limit') setLimit(result.active);
      else {
        setLimit(null);
        setGoalId(result.goalId);
      }
    } finally {
      setBusy(false);
    }
  };

  const setAnswer = (i: number, value: string) => {
    const next = [...answers];
    next[i] = value;
    setAnswers(next);
  };

  const build = async () => {
    if (!goalId) return;
    setBusy(true);
    await answer({ goalId, answers, tomorrow: localDate(1) });
    router.replace(`/goals/${goalId}`);
  };

  return (
    <Screen>
      <BackLink onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      {!goalId ? (
        <>
          <View style={{ gap: Spacing.two }}>
            <T size={30} weight="700">
              What do you want to get to?
            </T>
            <T tone="textSecondary">Say it in plain words. We will turn it into a ladder.</T>
          </View>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="e.g. run 75 miles"
            placeholderTextColor={theme.textSecondary}
            style={[{ borderWidth: 1, borderRadius: 16, padding: Spacing.three, fontSize: 18 }, input]}
            autoFocus
            returnKeyType="next"
            onSubmitEditing={() => text.trim() && submit()}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
            {EXAMPLES.map((ex) => (
              <Chip key={ex} label={ex} onPress={() => setText(ex)} />
            ))}
          </View>
          <Button label="Next" busy={busy} disabled={!text.trim()} onPress={() => submit()} />
          {limit ? (
            <Card>
              <T weight="700">You already have 3 goals in motion.</T>
              <T tone="textSecondary">Three is the most that stays calm. Pause one to make room; you can bring it back any time.</T>
              {limit.map((g) => (
                <View key={g._id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two }}>
                  <T style={{ flex: 1 }}>{g.title}</T>
                  <Button
                    small
                    kind="quiet"
                    label="Pause it"
                    onPress={async () => {
                      await pause({ goalId: g._id });
                      await submit();
                    }}
                  />
                </View>
              ))}
            </Card>
          ) : null}
        </>
      ) : goal === undefined || (goal && goal.status === 'clarifying' && goal.questions.length === 0) ? (
        <Thinking label="Thinking of 3 quick questions" />
      ) : goal === null ? (
        <T>That goal is gone.</T>
      ) : goal.status === 'failed' ? (
        <Card>
          <T weight="700">That took a wrong turn.</T>
          <T size={13} tone="textSecondary">{goal.error}</T>
          <Button label="Try again" onPress={() => retry({ goalId: goal._id, tomorrow: localDate(1) })} />
        </Card>
      ) : (
        <>
          <View style={{ gap: Spacing.two }}>
            <T size={13} weight="700" tone="textSecondary">
              {goal.title.toUpperCase()}
            </T>
            <T size={28} weight="700">
              Three quick questions
            </T>
            <T tone="textSecondary">Tap an answer or type your own. Then we check how realistic it is.</T>
          </View>
          {goal.questions.map((q, i) => (
            <Card key={q.question}>
              <T weight="700">{q.question}</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
                {q.options.map((opt) => (
                  <Chip key={opt} label={opt} selected={answers[i] === opt} onPress={() => setAnswer(i, opt)} />
                ))}
              </View>
              <TextInput
                value={q.options.includes(answers[i] ?? '') ? '' : (answers[i] ?? '')}
                onChangeText={(value) => setAnswer(i, value)}
                placeholder="or in your words"
                placeholderTextColor={theme.textSecondary}
                style={[{ borderWidth: 1, borderRadius: 12, padding: Spacing.two + 2, fontSize: 15 }, input]}
              />
            </Card>
          ))}
          <Button
            label="Build my plan"
            busy={busy || goal.status === 'planning'}
            disabled={goal.questions.some((_, i) => !answers[i]?.trim())}
            onPress={build}
          />
        </>
      )}
    </Screen>
  );
}
