import { sql } from 'drizzle-orm';
import { sqliteTable, text, blob, index, customType } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { desc } from 'drizzle-orm';

const float32Array = customType<{
  data: number[];                // TS 端类型
  config: { dimensions: number };// 必须传维度
  configRequired: true;
  driverData: Buffer;            // SQLite 存成 BLOB
}>({
  dataType(config) {
    return `F32_BLOB(${config.dimensions})`;
  },
  fromDriver(buf: Buffer) {
    return Array.from(new Float32Array(buf.buffer));
  },
  toDriver(arr: number[]) {
    // 用 Turso 提供的 vector32() 函数构造 BLOB
    return sql`vector32(${JSON.stringify(arr)})`;
  },
});

// Memos table - using TEXT ID to match Turso structure
export const memos = sqliteTable('memos', {
  id: text('id').primaryKey().$type<string>(),
  content: text('content').notNull(),
  images: text('images').notNull().default('[]'), // JSON string array
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
  embedding: float32Array('embedding', { dimensions: 2560 }), // ← 改成 2560
}, (table) => [
  // 优化后的复合索引 - 同时支持筛选和排序
  index('memos_active_created_idx').on(table.deletedAt, desc(table.createdAt)),
  index('memos_active_updated_idx').on(table.deletedAt, desc(table.updatedAt)),
  // 保留原有单列索引作为备用
  index('memos_created_at_idx').on(table.createdAt),
  index('memos_updated_at_idx').on(table.updatedAt),
  index('memos_deleted_at_idx').on(table.deletedAt),
]);

// Tags table - using TEXT ID to match Turso structure
export const tags = sqliteTable('tags', {
  id: text('id').primaryKey().$type<string>(),
  name: text('name').notNull().unique(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('tags_name_idx').on(table.name),
]);

// Links table - using TEXT ID to match Turso structure
export const links = sqliteTable('links', {
  id: text('id').primaryKey().$type<string>(),
  link: text('link').notNull(),
  text: text('text'),
  memoId: text('memo_id').notNull().unique(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('links_memo_id_idx').on(table.memoId),
]);

// Many-to-many relationship table for memos and tags - 使用有意义的字段名
export const memoTags = sqliteTable('_MemoToTag', {
  memoId: text('memo_id').notNull(),
  tagId: text('tag_id').notNull(),
}, (table) => [
  index('memo_tags_memo_id_idx').on(table.memoId),
  index('memo_tags_tag_id_idx').on(table.tagId),
]);

// Sync metadata table for tracking synchronization
export const syncMetadata = sqliteTable('sync_metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// Relations
export const memosRelations = relations(memos, ({ one, many }) => ({
  link: one(links, {
    fields: [memos.id],
    references: [links.memoId],
  }),
  memoTags: many(memoTags, {
    relationName: 'MemoToTag',
  }),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  memoTags: many(memoTags, {
    relationName: 'MemoToTag',
  }),
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
    relationName: 'MemoToTag',
  }),
  tag: one(tags, {
    fields: [memoTags.tagId],
    references: [tags.id],
    relationName: 'MemoToTag',
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