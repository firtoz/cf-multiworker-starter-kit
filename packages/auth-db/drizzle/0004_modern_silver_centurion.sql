DROP INDEX `user_email_email_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_user_id_source_unique` ON `user_email` (`user_id`,`source`);