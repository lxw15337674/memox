CREATE TABLE `memo_statistics` (
	`id` text PRIMARY KEY DEFAULT 'latest' NOT NULL,
	`total_memos` text NOT NULL,
	`total_days` text NOT NULL,
	`total_words` text NOT NULL,
	`daily_stats` text NOT NULL,
	`calculated_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
DROP INDEX "links_memo_id_unique";--> statement-breakpoint
DROP INDEX "links_memo_id_idx";--> statement-breakpoint
DROP INDEX "memo_tags_memo_id_idx";--> statement-breakpoint
DROP INDEX "memo_tags_tag_id_idx";--> statement-breakpoint
DROP INDEX "memos_active_created_idx";--> statement-breakpoint
DROP INDEX "memos_active_updated_idx";--> statement-breakpoint
DROP INDEX "memos_created_at_idx";--> statement-breakpoint
DROP INDEX "memos_updated_at_idx";--> statement-breakpoint
DROP INDEX "memos_deleted_at_idx";--> statement-breakpoint
DROP INDEX "tags_name_unique";--> statement-breakpoint
DROP INDEX "tags_name_idx";--> statement-breakpoint
ALTER TABLE `memos` ALTER COLUMN "embedding" TO "embedding" F32_BLOB(2560);--> statement-breakpoint
CREATE UNIQUE INDEX `links_memo_id_unique` ON `links` (`memo_id`);--> statement-breakpoint
CREATE INDEX `links_memo_id_idx` ON `links` (`memo_id`);--> statement-breakpoint
CREATE INDEX `memo_tags_memo_id_idx` ON `_MemoToTag` (`memo_id`);--> statement-breakpoint
CREATE INDEX `memo_tags_tag_id_idx` ON `_MemoToTag` (`tag_id`);--> statement-breakpoint
CREATE INDEX `memos_active_created_idx` ON `memos` (`deleted_at`,`"created_at" desc`);--> statement-breakpoint
CREATE INDEX `memos_active_updated_idx` ON `memos` (`deleted_at`,`"updated_at" desc`);--> statement-breakpoint
CREATE INDEX `memos_created_at_idx` ON `memos` (`created_at`);--> statement-breakpoint
CREATE INDEX `memos_updated_at_idx` ON `memos` (`updated_at`);--> statement-breakpoint
CREATE INDEX `memos_deleted_at_idx` ON `memos` (`deleted_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE INDEX `tags_name_idx` ON `tags` (`name`);--> statement-breakpoint
CREATE INDEX `memos_active_created_idx` ON `memos` (`deleted_at`,"created_at" desc);--> statement-breakpoint
CREATE INDEX `memos_active_updated_idx` ON `memos` (`deleted_at`,"updated_at" desc);