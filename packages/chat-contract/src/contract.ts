import { defineSocka } from "@firtoz/socka/core";
import * as z from "zod";

export const CHATROOM_INTERNAL_SECRET_HEADER = "x-cf-starter-chatroom-secret";

/** Max display name chars (Socka `createData` from `?name=` and `setDisplayName`). */
export const CHAT_DISPLAY_NAME_MAX_CHARS = 64;

/** Max message body chars for demo chat persistence. */
export const CHAT_MESSAGE_TEXT_MAX_CHARS = 2000;

const chatDisplayNameZ = z.string().min(1).max(CHAT_DISPLAY_NAME_MAX_CHARS);

export const messageRow = z.object({
	id: z.string(),
	ts: z.number(),
	userId: z.string(),
	displayName: chatDisplayNameZ,
	text: z.string().min(1).max(CHAT_MESSAGE_TEXT_MAX_CHARS),
});

export type ChatMessageRow = z.infer<typeof messageRow>;

const onlineUser = z.object({
	userId: z.string(),
	displayName: chatDisplayNameZ,
});

export const chatContract = defineSocka({
	calls: {
		listHistory: {
			input: z.object({ limit: z.number().int().min(1).max(500).optional() }),
			output: z.object({ messages: z.array(messageRow) }),
		},
		listPresence: {
			input: z.object({}).optional(),
			output: z.object({
				selfUserId: z.string(),
				/** Everyone in the room, including self (sorted for display). */
				users: z.array(onlineUser),
			}),
		},
		sendMessage: {
			input: z.object({ text: z.string().min(1).max(CHAT_MESSAGE_TEXT_MAX_CHARS) }),
			output: z.object({ ok: z.literal(true) }),
		},
		setDisplayName: {
			input: z.object({
				displayName: chatDisplayNameZ,
			}),
			output: z.object({ ok: z.literal(true) }),
		},
		clearHistory: {
			input: z.object({}).optional(),
			output: z.object({ ok: z.literal(true) }),
		},
	},
	pushes: {
		/** Full sorted room list (all connections). Clients mark "you" with selfUserId from listPresence. */
		presenceUpdated: z.object({ users: z.array(onlineUser) }),
		userJoined: z.object({ userId: z.string(), displayName: chatDisplayNameZ }),
		userLeft: z.object({ userId: z.string(), displayName: chatDisplayNameZ }),
		roomMessage: messageRow,
		historyCleared: z.object({
			ts: z.number(),
			clearedByUserId: z.string(),
			clearedByDisplayName: chatDisplayNameZ,
		}),
	},
});
