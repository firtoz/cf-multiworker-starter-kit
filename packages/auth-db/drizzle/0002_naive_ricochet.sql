CREATE TABLE `user_email` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`source` text NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`is_notification_preferred` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_email_user_id_idx` ON `user_email` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_email_email_unique` ON `user_email` (`email`);