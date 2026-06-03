DROP INDEX `user_email_email_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_email_unique` ON `user_email` (`email`);