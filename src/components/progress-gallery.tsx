import { useMutation, useQuery } from 'convex/react';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Button, Card, T } from './goal-ui';
import { useTheme } from '@/hooks/use-theme';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { GalleryGlyph, MotionGroup } from './route-graphics';

export function ProgressGallery({ goalId }: { goalId: Id<'goals'> }) {
  const theme = useTheme();
  const photos = useQuery(api.gallery.list, { goalId });
  const uploadUrl = useMutation(api.gallery.uploadUrl);
  const add = useMutation(api.gallery.add);
  const remove = useMutation(api.gallery.remove);
  const [selected, setSelected] = useState<ImagePicker.ImagePickerAsset | null>(
    null,
  );
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<Id<'progressPhotos'> | null>(null);
  const [open, setOpen] = useState(false);
  async function pick() {
    setError('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
        exif: false,
      });
      if (!result.canceled && result.assets[0]) {
        if ((result.assets[0].fileSize ?? 0) > 10 * 1024 * 1024) {
          setError('Choose a photo under 10 MB.');
          return;
        }
        setSelected(result.assets[0]);
        setOpen(true);
      }
    } catch {
      setError('Couldn’t open your photo library. You can try again.');
    }
  }
  async function save() {
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const blob = await (
        await fetch(selected.uri, { signal: controller.signal })
      ).blob();
      if (blob.size > 10 * 1024 * 1024)
        throw new Error('Choose a photo under 10 MB.');
      const url = await uploadUrl({ goalId });
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': selected.mimeType || blob.type || 'image/jpeg',
        },
        body: blob,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('The upload didn’t finish. Try again.');
      const { storageId } = (await response.json()) as {
        storageId: Id<'_storage'>;
      };
      await add({ goalId, storageId, caption });
      setSelected(null);
      setCaption('');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Couldn’t save your photo. Reconnect and try again.',
      );
    } finally {
      clearTimeout(timeout);
      setBusy(false);
    }
  }
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <GalleryGlyph />
        <T size={22} weight="600">
          Progress photos
        </T>
      </View>
      <T size={13} tone="textSecondary">
        Non-personal sample images only · shared demo, no analysis or
        completion.
      </T>
      <Button
        kind="quiet"
        label="Add a demo photo"
        onPress={pick}
        disabled={busy}
      />
      {selected ? (
        <View style={{ gap: 12 }}>
          <Image
            source={{ uri: selected.uri }}
            style={{ width: '100%', height: 230, borderRadius: 16 }}
            contentFit="contain"
            accessibilityLabel="Photo selected for your gallery"
          />
          <T size={12} tone="textSecondary">
            Added today · visible in the shared demo.
          </T>
          <TextInput
            accessibilityLabel="Optional photo caption"
            placeholder="Sample caption (optional)"
            placeholderTextColor={theme.textSecondary}
            value={caption}
            onChangeText={setCaption}
            maxLength={240}
            style={{ color: theme.text, minHeight: 52, fontSize: 16 }}
          />
          <Button label="Save photo" busy={busy} onPress={save} />
          <Button
            kind="ghost"
            label="Cancel photo"
            disabled={busy}
            onPress={() => {
              setSelected(null);
              setCaption('');
            }}
          />
        </View>
      ) : null}
      {error ? <T size={13}>{error}</T> : null}
      {photos?.length ? (
        <Button
          kind="ghost"
          label={
            open
              ? 'Close gallery'
              : `Gallery · ${photos.length} photo${photos.length === 1 ? '' : 's'}`
          }
          onPress={() => setOpen(!open)}
        />
      ) : (
        <T size={13} tone="textSecondary">
          No photos added.
        </T>
      )}
      {open ? (
        <MotionGroup>
          {photos?.map(({ photo, url }) => (
            <View
              key={photo._id}
              style={{
                gap: 10,
                paddingTop: 14,
                borderTopWidth: 1,
                borderColor: theme.border,
              }}
            >
              {url ? (
                <Image
                  source={{ uri: url }}
                  contentFit="contain"
                  style={{ width: '100%', height: 270, borderRadius: 16 }}
                  accessibilityLabel={photo.caption || 'Saved progress photo'}
                />
              ) : (
                <T>Photo unavailable.</T>
              )}
              <T size={12} tone="textSecondary">
                Added{' '}
                {new Date(photo.addedAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </T>
              {photo.caption ? <T>{photo.caption}</T> : null}
              {removing === photo._id ? (
                <>
                  <T size={13}>Remove this photo from your gallery?</T>
                  <Button
                    small
                    kind="quiet"
                    label="Yes, remove photo"
                    disabled={busy}
                    onPress={async () => {
                      setBusy(true);
                      try {
                        await remove({ photoId: photo._id });
                        setRemoving(null);
                      } catch {
                        setError('Couldn’t remove the photo. Try again.');
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                  <Button
                    small
                    kind="ghost"
                    label="Cancel"
                    onPress={() => setRemoving(null)}
                  />
                </>
              ) : (
                <Button
                  small
                  kind="ghost"
                  label="Remove photo"
                  onPress={() => setRemoving(photo._id)}
                />
              )}
            </View>
          ))}
        </MotionGroup>
      ) : null}
    </Card>
  );
}
