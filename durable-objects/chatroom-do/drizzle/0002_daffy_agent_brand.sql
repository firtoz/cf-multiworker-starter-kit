PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`ts` integer NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`is_guest` integer DEFAULT false NOT NULL,
	`text` text NOT NULL,
	CONSTRAINT "chat_messages_display_name_len" CHECK(length("__new_chat_messages"."display_name") <= 64),
	CONSTRAINT "chat_messages_text_len" CHECK(length("__new_chat_messages"."text") >= 1 AND length("__new_chat_messages"."text") <= 2000)
);
--> statement-breakpoint
INSERT INTO `__new_chat_messages`("id", "ts", "user_id", "display_name", "is_guest", "text") SELECT "id", "ts", "user_id", "display_name", "is_guest", "text" FROM `chat_messages`;--> statement-breakpoint
DROP TABLE `chat_messages`;--> statement-breakpoint
ALTER TABLE `__new_chat_messages` RENAME TO `chat_messages`;--> statement-breakpoint
PRAGMA foreign_keys=ON;