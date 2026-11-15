import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { BackLink, Screen, T, Thinking } from '@/components/goal-ui';
import { ResearchView } from '@/components/research/research-view';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';

export default function ResearchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useQuery(api.research.get, { goalId: id as Id<'goals'> });
  const start = useMutation(api.research.start);
  const addStop = useMutation(api.research.addStop);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const back = () => router.canGoBack() ? router.back() : router.replace(`/goals/${id}`);

  return (
    <Screen>
      <BackLink onPress={back} />
      {data === undefined ? <Thinking label="Loading your research" /> : data === null ? <T>This goal is gone.</T> : (
        <ResearchView
          data={data}
          notice={notice}
          busy={busy}
          onStart={async (profile) => {
            setBusy(true);
            setNotice('');
            try {
              await start({ goalId: data.goal._id, ...profile });
            } catch (error) {
              setNotice(error instanceof ConvexError ? String(error.data) : 'Research could not start. Try again in a little while.');
            } finally {
              setBusy(false);
            }
          }}
          onAdd={async (researchId, key, weeks) => {
            const result = await addStop({ researchId, key, weeks });
            const messages = {
              added: 'Added after your current stop. Your route now includes the time you chose.',
              already: 'This stop is already on your route.',
              full: 'Your route is full for now. Finish a stop before adding more.',
              closed: 'Activate or resume this goal before adding a stop.',
            };
            setNotice(messages[result]);
          }}
          onRoute={() => router.push(`/goals/${data.goal._id}`)}
        />
      )}
    </Screen>
  );
}
