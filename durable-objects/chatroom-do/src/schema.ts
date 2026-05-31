import { PROFILE_NAME_MAX_CHARS } from "@internal/auth-db/constants";
import { CHAT_MESSAGE_TEXT_MAX_CHARS } from "@internal/chat-contract/limits";
import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const chatMessagesTable = sqliteTable(
	"chat_messages",
	{
		id: text("id").primaryKey(),
		ts: integer("ts", { mode: "number" }).notNull(),
		userId: text("user_id").notNull(),
		displayName: text("display_name").notNull(),
		isGuest: integer("is_guest", { mode: "boolean" }).notNull().default(false),
		text: text("text").notNull(),
	},
	(table) => [
		check(
			"chat_messages_display_name_len",
			sql`length(${table.displayName}) <= ${sql.raw(String(PROFILE_NAME_MAX_CHARS))}`,
		),
		check(
			"chat_messages_text_len",
			sql`length(${table.text}) >= 1 AND length(${table.text}) <= ${sql.raw(String(CHAT_MESSAGE_TEXT_MAX_CHARS))}`,
		),
	],
);

export type ChatMessageRow = InferSelectModel<typeof chatMessagesTable>;
export type ChatMessageInsert = InferInsertModel<typeof chatMessagesTable>;
