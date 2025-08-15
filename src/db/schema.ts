import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, blob, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// Memos table
export const memos = sqliteTable('memos', {
  id: integer('id').primaryKey({ autoIncrement: true }).$type<number>(),
  content: text('content').notNull(),
  images: text('images').notNull().default('[]'), // JSON string array
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  deletedAt: text('deleted_at'),
  embedding: blob('embedding'), // For vector search
}, (table) => [
  index('memos_created_at_idx').on(table.createdAt),
  index('memos_updated_at_idx').on(table.updatedAt),
  index('memos_deleted_at_idx').on(table.deletedAt),
]);

// Tags table
export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }).$type<number>(),
  name: text('name').notNull().unique(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('tags_name_idx').on(table.name),
]);

// Links table
export const links = sqliteTable('links', {
  id: integer('id').primaryKey({ autoIncrement: true }).$type<number>(),
  link: text('link').notNull(),
  text: text('text'),
  memoId: integer('memo_id').notNull().unique(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('links_memo_id_idx').on(table.memoId),
]);

// Many-to-many relationship table for memos and tags
export const memoTags = sqliteTable('_MemoToTag', {
  memoId: integer('memoId').notNull(),
  tagId: integer('tagId').notNull(),
}, (table) => [
  index('memo_tags_memo_id_idx').on(table.memoId),
  index('memo_tags_tag_id_idx').on(table.tagId),
]);

// Sync metadata table for tracking synchronization
export const syncMetadata = sqliteTable('sync_metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
}, (t) => []);

// Relations
export const memosRelations = relations(memos, ({ one, many }) => ({
  link: one(links, {
    fields: [memos.id],
    references: [links.memoId],
  }),
  memoTags: many(memoTags),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  memoTags: many(memoTags),
}));

export const linksRelations = relations(links, ({ one }) => ({
  memo: one(memos, {
    fields: [links.memoId],
    references: [memos.id],
  }),
}));

export const memoTagsRelations = relations(memoTags, ({ one }) => ({
  memo: one(memos, {
    fields: [memoTags.memoId],
    references: [memos.id],
  }),
  tag: one(tags, {
    fields: [memoTags.tagId],
    references: [tags.id],
  }),
}));

// Type exports for use in application
export type Memo = typeof memos.$inferSelect;
export type NewMemo = typeof memos.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type Link = typeof links.$inferSelect;
export type NewLink = typeof links.$inferInsert;
export type MemoTag = typeof memoTags.$inferSelect;
export type NewMemoTag = typeof memoTags.$inferInsert;