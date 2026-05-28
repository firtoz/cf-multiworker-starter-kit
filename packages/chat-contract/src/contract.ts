import { defineSocka } from "@firtoz/socka/core";
import { PRODUCT_PREFIX } from "alchemy-utils/worker-peer-scripts";
import * as z from "zod";
import { CHAT_DISPLAY_NAME_MAX_CHARS, CHAT_MESSAGE_TEXT_MAX_CHARS } from "./limits";

export * from "./attested-identity";
export { CHAT_DISPLAY_NAME_MAX_CHARS, CHAT_MESSAGE_TEXT_MAX_CHARS } from "./limits";

export const CHATROOM_INTERNAL_SECRET_HEADER = `x-${PRODUCT_PREFIX}-chatroom-secret`;

/** Set by web worker after AUTH session verification (not client-controlled). */
export const CHATROOM_AUTH_USER_ID_HEADER = `x-${PRODUCT_PREFIX}-chat-user-id`;

/** Display name attested by web worker from session profile or guest `?name=`. */
export const CHATROOM_AUTH_DISPLAY_NAME_HEADER = `x-${PRODUCT_PREFIX}-chat-display-name`;

/** `"true"` or `"false"` — set by web worker (not client-controlled). */
export const CHATROOM_AUTH_IS_GUEST_HEADER = `x-${PRODUCT_PREFIX}-chat-is-guest`;

const chatDisplayNameZ = z.string().min(1).max(CHAT_DISPLAY_NAME_MAX_CHARS);

export const messageRow = z.object({
	id: z.string(),
	ts: z.number(),
	userId: z.string(),
	displayName: chatDisplayNameZ,
	isGuest: z.boolean(),
	text: z.string().min(1).max(CHAT_MESSAGE_TEXT_MAX_CHARS),
});

export type ChatMessageRow = z.infer<typeof messageRow>;

const onlineUser = z.object({
	userId: z.string(),
	displayName: chatDisplayNameZ,
	isGuest: z.boolean(),
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
		userJoined: z.object({
			userId: z.string(),
			displayName: chatDisplayNameZ,
			isGuest: z.boolean(),
		}),
		userLeft: z.object({
			userId: z.string(),
			displayName: chatDisplayNameZ,
			isGuest: z.boolean(),
		}),
		roomMessage: messageRow,
		historyCleared: z.object({
			ts: z.number(),
			clearedByUserId: z.string(),
			clearedByDisplayName: chatDisplayNameZ,
			clearedByIsGuest: z.boolean(),
		}),
	},
});
