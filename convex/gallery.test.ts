/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import schema from './schema';
import { api } from './_generated/api';

const modules = import.meta.glob('./**/*.ts');
const setup = () => convexTest(schema, modules);
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
async function goal(t: ReturnType<typeof setup>) {
  return t.run(ctx => ctx.db.insert('goals', { deviceId: 'gallery-test', text: 'Draw', title: 'Draw', status: 'active', questions: [], currentRung: 0, slipDays: 0, missStreak: 0 }));
}
test('gallery saves dated captions, returns newest first and deletes without completing work', async () => {
  const t = setup(); const goalId = await goal(t);
  const storageId = await t.run(ctx => ctx.storage.store(new Blob(['fixture'], { type: 'image/jpeg' })));
  const first = await t.mutation(api.gallery.add, { goalId, storageId, caption: ' My first sketch ' });
  expect(await t.mutation(api.gallery.add, { goalId, storageId, caption: 'Retry' })).toBe(first);
  await vi.advanceTimersByTimeAsync(1000);
  const secondStorage = await t.run(ctx => ctx.storage.store(new Blob(['fixture2'], { type: 'image/png' })));
  const second = await t.mutation(api.gallery.add, { goalId, storageId: secondStorage, caption: '' });
  const photos = await t.query(api.gallery.list, { goalId });
  expect(photos.map(p => p.photo._id)).toEqual([second, first]);
  expect(photos[1].photo.caption).toBe('My first sketch');
  expect(photos[0].photo.addedAt).toBeGreaterThan(photos[1].photo.addedAt);
  expect(photos[0].url).toBeTruthy();
  await t.mutation(api.gallery.remove, { photoId: first });
  expect(await t.run(ctx => ctx.storage.getUrl(storageId))).toBeNull();
  expect((await t.query(api.goals.get, { goalId }))?.status).toBe('active');
  expect((await t.query(api.goals.get, { goalId }))?.currentRung).toBe(0);
  await t.mutation(api.goals.remove, { goalId });
  expect(await t.query(api.gallery.list, { goalId })).toEqual([]);
  expect(await t.run(ctx => ctx.storage.getUrl(secondStorage))).toBeNull();
});
test('gallery refuses non-images and oversized captions', async () => {
  const t = setup(); const goalId = await goal(t);
  const storageId = await t.run(ctx => ctx.storage.store(new Blob(['text'], { type: 'text/plain' })));
  await expect(t.mutation(api.gallery.add, { goalId, storageId, caption: '' })).rejects.toThrow('image smaller');
  await expect(t.mutation(api.gallery.add, { goalId, storageId, caption: 'x'.repeat(241) })).rejects.toThrow('240');
  expect(await t.query(api.gallery.list, { goalId })).toEqual([]);
});
