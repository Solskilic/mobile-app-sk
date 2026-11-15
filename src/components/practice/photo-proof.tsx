import { useMutation, useQuery } from 'convex/react';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, Platform, View } from 'react-native';

import { Button, Card, T, Thinking } from '@/components/goal-ui';
import { localDate } from '@/lib/plan';
import { api } from '../../../convex/_generated/api';
import type { Doc, Id } from '../../../convex/_generated/dataModel';

type Target =
  | { taskId: Id<'tasks'>; practiceId?: never; goalId?: never }
  | { taskId?: never; practiceId: Id<'practice'>; goalId?: never }
  | { taskId?: never; practiceId?: never; goalId: Id<'goals'> };

export function ProofNote({ proof }: { proof: Doc<'proofs'> }) {
  const retry = useMutation(api.practice.retryProof);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState(false);
  if (proof.status === 'checking')
    return (
      <Thinking label="Looking at your photo and reflecting on your progress" />
    );
  return (
    <View style={{ gap: 8 }}>
      <T size={13} weight="700" tone="accent">
        {proof.status === 'logged'
          ? 'A MOMENT OF PROGRESS'
          : 'YOUR PHOTO IS SAVED'}
      </T>
      {proof.shows ? (
        <T size={14} tone="textSecondary">
          {proof.shows}
        </T>
      ) : null}
      {proof.progress ? <T weight="600">{proof.progress}</T> : null}
      <T>
        {proof.status === 'failed'
          ? "The reflection didn't come through. Your photo is safe, and you can still check this step off yourself."
          : proof.note}
      </T>
      {proof.status === 'failed' ? (
        <Button
          small
          kind="quiet"
          label="Try the reflection again"
          busy={retrying}
          onPress={async () => {
            setRetrying(true);
            setRetryError(false);
            try {
              await retry({ proofId: proof._id });
            } catch {
              setRetryError(true);
            } finally {
              setRetrying(false);
            }
          }}
        />
      ) : null}
      {retryError ? (
        <T size={13} tone="textSecondary">
          That didn&apos;t connect. You can come back to it later.
        </T>
      ) : null}
      {proof.feedback ? (
        <View style={{ gap: 6 }}>
          {proof.feedback.better ? (
            <T size={14}>{proof.feedback.better}</T>
          ) : null}
          {proof.feedback.still ? (
            <T size={14} tone="textSecondary">
              {proof.feedback.still}
            </T>
          ) : null}
          {proof.feedback.next ? (
            <T size={14} tone="accent">
              Next: {proof.feedback.next}
            </T>
          ) : null}
        </View>
      ) : null}
      <T size={12} tone="textSecondary">
        An AI reflection, not a grade. You know your effort best.
      </T>
    </View>
  );
}

export function PhotoProof({ target }: { target: Target }) {
  const uploadUrl = useMutation(api.practice.generateUploadUrl);
  const addProof = useMutation(api.practice.addProof);
  const latest = useQuery(
    api.practice.forTask,
    target.taskId ? { taskId: target.taskId } : 'skip',
  );
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [why, setWhy] = useState(false);
  const [saved, setSaved] = useState(false);

  const pick = async (camera: boolean) => {
    setError(null);
    setSaved(false);
    try {
      if (camera && Platform.OS !== 'web') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError(
            'Camera access is off. You can choose an existing photo or check this step off yourself.',
          );
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        quality: 0.7,
        allowsEditing: true,
        exif: false,
      };
      const result = camera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled) return;
      const chosen = result.assets[0];
      if (chosen.fileSize && chosen.fileSize > 10 * 1024 * 1024) {
        setError('Choose a photo smaller than 10 MB.');
        return;
      }
      setAsset(chosen);
    } catch {
      setError(
        "That photo couldn't be opened. Try choosing one from your library.",
      );
    }
  };

  const save = async () => {
    if (!asset) return;
    setBusy(true);
    setError(null);
    try {
      const blob = asset.file ?? (await (await fetch(asset.uri)).blob());
      if (blob.size > 10 * 1024 * 1024) throw new Error('size');
      const type = blob.type || asset.mimeType || 'image/jpeg';
      if (
        !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(type)
      ) {
        setError('Please choose a JPG, PNG, WebP or GIF photo.');
        return;
      }
      const response = await fetch(await uploadUrl({}), {
        method: 'POST',
        headers: { 'Content-Type': type },
        body: blob,
      });
      if (!response.ok) throw new Error('upload');
      const { storageId } = (await response.json()) as {
        storageId: Id<'_storage'>;
      };
      await addProof({ storageId, ...target, today: localDate() });
      setAsset(null);
      setSaved(true);
    } catch {
      setError(
        "Your photo didn't save. Try again when you're ready; checking off a step never needs a photo.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Button
          small
          kind="quiet"
          label="Add a photo"
          disabled={busy}
          onPress={() => pick(false)}
        />
        <Button
          small
          kind="ghost"
          label="Take a photo"
          disabled={busy}
          onPress={() => pick(true)}
        />
        <Button
          small
          kind="ghost"
          label="Why a photo?"
          onPress={() => setWhy(!why)}
        />
      </View>
      {why ? (
        <T size={13} tone="textSecondary">
          A photo keeps a record you can look back on. AI can read a distance or
          page number and reflect on how your practice is changing. It is always
          optional.
        </T>
      ) : null}
      {asset ? (
        <Card>
          <Image
            source={{ uri: asset.uri }}
            accessibilityLabel="Your selected progress photo"
            style={{ width: '100%', height: 220, borderRadius: 8 }}
            resizeMode="contain"
          />
          <T size={13} tone="textSecondary">
            Saving sends this photo and up to three earlier attempts to OpenAI
            for a kind reflection. This shared demo is not private; avoid faces
            or private details. If it fits this step, the step will be checked off.
          </T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button small label="Save & reflect" busy={busy} onPress={save} />
            <Button
              small
              kind="ghost"
              label="Cancel"
              disabled={busy}
              onPress={() => setAsset(null)}
            />
          </View>
        </Card>
      ) : null}
      {error ? (
        <T size={13} tone="textSecondary">
          {error}
        </T>
      ) : null}
      {saved && !target.taskId ? (
        <T size={13} tone="accent">
          Photo saved. Your reflection will appear in the timeline below.
        </T>
      ) : null}
      {latest ? <ProofNote proof={latest} /> : null}
    </View>
  );
}
