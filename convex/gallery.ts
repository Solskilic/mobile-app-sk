import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import schema from './schema';

export const list = query({
  args: { goalId: v.id('goals') }, returns: v.array(v.object({ photo: schema.doc('progressPhotos'), url: v.union(v.string(), v.null()) })),
  handler: async (ctx, { goalId }) => {
    const photos = await ctx.db.query('progressPhotos').withIndex('by_goal_and_addedAt', q => q.eq('goalId', goalId)).order('desc').take(100);
    return Promise.all(photos.map(async photo => ({ photo, url: await ctx.storage.getUrl(photo.storageId) })));
  },
});
export const uploadUrl = mutation({ args: { goalId: v.id('goals') }, returns: v.string(), handler: async (ctx, { goalId }) => {
  if (!await ctx.db.get('goals', goalId)) throw new Error('Goal not found');
  const existing = await ctx.db.query('progressPhotos').withIndex('by_goal_and_addedAt', q => q.eq('goalId', goalId)).take(100);
  if (existing.length >= 100) throw new Error('This demo holds up to 100 photos per goal. Remove one to add another.');
  return ctx.storage.generateUploadUrl();
} });
export const add = mutation({ args: { goalId: v.id('goals'), storageId: v.id('_storage'), caption: v.string() }, returns: v.id('progressPhotos'), handler: async (ctx, args) => {
  if (!await ctx.db.get('goals', args.goalId)) throw new Error('Goal not found');
  if (args.caption.length > 240) throw new Error('Keep captions under 240 characters');
  const file = await ctx.db.system.get('_storage', args.storageId);
  if (!file || !['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif'].includes(file.contentType ?? '') || file.size > 10 * 1024 * 1024) throw new Error('Choose an image smaller than 10 MB');
  const existing = await ctx.db.query('progressPhotos').withIndex('by_goal_and_addedAt', q => q.eq('goalId', args.goalId)).take(100);
  if (existing.length >= 100) throw new Error('Remove a photo before adding another');
  const duplicate = existing.find(p => p.storageId === args.storageId);
  return duplicate?._id ?? ctx.db.insert('progressPhotos', { ...args, caption: args.caption.trim(), addedAt: Date.now() });
} });
export const remove = mutation({ args: { photoId: v.id('progressPhotos') }, returns: v.null(), handler: async (ctx, { photoId }) => {
  const photo = await ctx.db.get('progressPhotos', photoId);
  if (photo) { await ctx.storage.delete(photo.storageId); await ctx.db.delete('progressPhotos', photoId); }
  return null;
} });
