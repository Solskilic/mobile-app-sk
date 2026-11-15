import { useMutation, useQuery } from 'convex/react';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Button, Card, T } from './goal-ui';
import { useTheme } from '@/hooks/use-theme';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

export function ProgressGallery({ goalId }: { goalId: Id<'goals'> }) {
  const theme = useTheme();
  const photos = useQuery(api.gallery.list, { goalId });
  const uploadUrl = useMutation(api.gallery.uploadUrl);
  const add = useMutation(api.gallery.add);
  const remove = useMutation(api.gallery.remove);
  const [selected, setSelected] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<Id<'progressPhotos'> | null>(null);
  const [open, setOpen] = useState(false);
  async function pick() {
    setError('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.8, exif: false });
      if (!result.canceled && result.assets[0]) { if ((result.assets[0].fileSize ?? 0) > 10 * 1024 * 1024) { setError('Choose a photo under 10 MB.'); return; } setSelected(result.assets[0]); setOpen(true); }
    } catch { setError('Couldn’t open your photo library. You can try again.'); }
  }
  async function save() {
    if (!selected || busy) return;
    setBusy(true); setError('');
    try {
      const blob = await (await fetch(selected.uri)).blob();
      if (blob.size > 10 * 1024 * 1024) throw new Error('Choose a photo under 10 MB.');
      const url = await uploadUrl({ goalId });
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': selected.mimeType ?? blob.type ?? 'image/jpeg' }, body: blob });
      if (!response.ok) throw new Error('The upload didn’t finish. Try again.');
      const { storageId } = await response.json() as { storageId: Id<'_storage'> };
      await add({ goalId, storageId, caption }); setSelected(null); setCaption('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t save your photo. Reconnect and try again.'); }
    finally { setBusy(false); }
  }
  return <Card>
    <T size={22} weight="600">A little look back.</T><T size={14} tone="textSecondary">Photos for your memories. No judging, analysing, or checking off tasks.</T>
    <Button kind="quiet" label="Add a progress photo" onPress={pick} disabled={busy} />
    {selected ? <View style={{ gap: 12 }}><Image source={{ uri: selected.uri }} style={{ width: '100%', height: 230, borderRadius: 16 }} contentFit="contain" accessibilityLabel="Photo selected for your gallery" /><T size={12} tone="textSecondary">Added today · only save what you’re happy to put in this shared demo.</T><TextInput accessibilityLabel="Optional photo caption" placeholder="A short caption, if you like" placeholderTextColor={theme.textSecondary} value={caption} onChangeText={setCaption} maxLength={240} style={{ color: theme.text, minHeight: 52, fontSize: 16 }} /><Button label="Save this memory" busy={busy} onPress={save} /><Button kind="ghost" label="Cancel photo" disabled={busy} onPress={() => { setSelected(null); setCaption(''); }} /></View> : null}
    {error ? <T size={13}>{error}</T> : null}
    {photos?.length ? <Button kind="ghost" label={open ? 'Close gallery' : `Look back · ${photos.length} photo${photos.length === 1 ? '' : 's'}`} onPress={() => setOpen(!open)} /> : <T size={13} tone="textSecondary">Your first photo will live here, dated and in order.</T>}
    {open ? photos?.map(({ photo, url }) => <View key={photo._id} style={{ gap: 10, paddingTop: 14, borderTopWidth: 1, borderColor: theme.border }}>{url ? <Image source={{ uri: url }} contentFit="contain" style={{ width: '100%', height: 270, borderRadius: 16 }} accessibilityLabel={photo.caption || 'Saved progress photo'} /> : <T>Photo unavailable.</T>}<T size={12} tone="textSecondary">Added {new Date(photo.addedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</T>{photo.caption ? <T>{photo.caption}</T> : null}{removing === photo._id ? <><T size={13}>Remove this photo from your gallery?</T><Button small kind="quiet" label="Yes, remove photo" disabled={busy} onPress={async () => { setBusy(true); try { await remove({ photoId: photo._id }); setRemoving(null); } catch { setError('Couldn’t remove the photo. Try again.'); } finally { setBusy(false); } }} /><Button small kind="ghost" label="Keep it" onPress={() => setRemoving(null)} /></> : <Button small kind="ghost" label="Remove photo" onPress={() => setRemoving(photo._id)} />}</View>) : null}
  </Card>;
}
