import { useAction, useMutation } from 'convex/react';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, T } from '@/components/goal-ui';
import { PhotoProof } from '@/components/practice/photo-proof';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '../../convex/_generated/api';
import type { Doc } from '../../convex/_generated/dataModel';

export type TaskView = Doc<'tasks'> & { goalTitle: string; rungTitle: string };

export function TaskCard({ task, today, past }: { task: TaskView; today: string; past?: boolean }) {
  const theme = useTheme();
  const setDone = useMutation(api.tasks.setDone);
  const miss = useMutation(api.tasks.miss);
  const swap = useAction(api.ai.swap);
  const shrink = useAction(api.ai.shrink);
  const [busy, setBusy] = useState<'swap' | 'shrink' | null>(null);
  const done = task.status === 'done';
  const missed = task.status === 'missed';

  const run = async (kind: 'swap' | 'shrink') => {
    setBusy(kind);
    try {
      if (kind === 'swap') await swap({ taskId: task._id });
      else await shrink({ taskId: task._id, minutes: 10 });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card style={{ opacity: missed ? 0.7 : 1 }}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          onPress={() => setDone({ taskId: task._id, done: !done, today })}
          hitSlop={10}
          style={[styles.check, { borderColor: theme.accent, backgroundColor: done ? theme.accent : 'transparent' }]}>
          {done ? (
            <T size={16} weight="800" tone="onAccent">
              ✓
            </T>
          ) : null}
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <T size={17} weight="600" style={done ? { textDecorationLine: 'line-through' } : undefined}>
            {task.title}
          </T>
          <T size={13} tone="textSecondary">
            {task.minutes} min{task.shrunk ? ' · shrunk' : ''}
            {missed ? ' · moved on, no harm done' : ''}
          </T>
        </View>
      </View>
      <View style={[styles.tag, { backgroundColor: theme.accentSoft }]}>
        <T size={12} weight="700" tone="accent" numberOfLines={1}>
          {task.goalTitle} · {task.rungTitle}
        </T>
      </View>
      <T size={14} tone="textSecondary">
        {task.why}
      </T>
      <PhotoProof target={{ taskId: task._id }} />
      {!past && task.status === 'open' ? (
        <View style={styles.actions}>
          <Button small kind="quiet" label="Swap" busy={busy === 'swap'} disabled={!!busy} onPress={() => run('swap')} />
          {task.minutes > 10 ? (
            <Button small kind="quiet" label="Make it 10 min" busy={busy === 'shrink'} disabled={!!busy} onPress={() => run('shrink')} />
          ) : null}
          <Button small kind="ghost" label="Didn't happen" disabled={!!busy} onPress={() => miss({ taskId: task._id })} />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center' },
  check: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tag: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: Spacing.two, paddingVertical: 2, maxWidth: '100%' },
  actions: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
});
