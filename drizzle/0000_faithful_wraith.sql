CREATE TABLE `links` (
	`id` text PRIMARY KEY NOT NULL,
	`link` text NOT NULL,
	`text` text,
	`memo_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `links_memo_id_unique` ON `links` (`memo_id`);--> statement-breakpoint
CREATE INDEX `links_memo_id_idx` ON `links` (`memo_id`);--> statement-breakpoint
CREATE TABLE `_MemoToTag` (
	`memo_id` text NOT NULL,
	`tag_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `memo_tags_memo_id_idx` ON `_MemoToTag` (`memo_id`);--> statement-breakpoint
CREATE INDEX `memo_tags_tag_id_idx` ON `_MemoToTag` (`tag_id`);--> statement-breakpoint
CREATE TABLE `memos` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`images` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`embedding` blob
);
--> statement-breakpoint
CREATE INDEX `memos_created_at_idx` ON `memos` (`created_at`);--> statement-breakpoint
CREATE INDEX `memos_updated_at_idx` ON `memos` (`updated_at`);--> statement-breakpoint
CREATE INDEX `memos_deleted_at_idx` ON `memos` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `sync_metadata` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE INDEX `tags_name_idx` ON `tags` (`name`);