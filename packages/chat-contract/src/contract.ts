import { defineSocka } from "@firtoz/socka/core";
import { PROFILE_NAME_MAX_CHARS } from "@internal/auth-db/constants";
import { PRODUCT_PREFIX } from "alchemy-utils/worker-peer-scripts";
import * as z from "zod";
import type { ChatAttestedIdentity } from "./attested-identity";
import { CHAT_MESSAGE_TEXT_MAX_CHARS } from "./limits";

export * from "./attested-identity";
export * from "./chat-attest-token";
export { CHAT_MESSAGE_TEXT_MAX_CHARS } from "./limits";

export const CHATROOM_INTERNAL_SECRET_HEADER = `x-${PRODUCT_PREFIX}-chatroom-secret`;

/** Set by the web worker after `env.AUTH` session lookup (not client-controlled). */
export const CHATROOM_AUTH_USER_ID_HEADER = `x-${PRODUCT_PREFIX}-chat-user-id`;

/** Display name from AUTH profile — set by the web worker after session lookup. */
export const CHATROOM_AUTH_DISPLAY_NAME_HEADER = `x-${PRODUCT_PREFIX}-chat-display-name`;

/** `"true"` or `"false"` — set by the web worker after session lookup (not client-controlled). */
export const CHATROOM_AUTH_IS_GUEST_HEADER = `x-${PRODUCT_PREFIX}-chat-is-guest`;

/** Strip client-supplied identity headers before service-binding forward. */
export function stripClientChatIdentityHeaders(headers: Headers): void {
	headers.delete(CHATROOM_AUTH_USER_ID_HEADER);
	headers.delete(CHATROOM_AUTH_DISPLAY_NAME_HEADER);
	headers.delete(CHATROOM_AUTH_IS_GUEST_HEADER);
}

/** Apply resolved identity when forwarding to chatroom / DO (after AUTH `getSession` on the web worker). */
export function applyChatIdentityHeaders(headers: Headers, identity: ChatAttestedIdentity): void {
	headers.set(CHATROOM_AUTH_USER_ID_HEADER, identity.userId);
	headers.set(CHATROOM_AUTH_DISPLAY_NAME_HEADER, identity.displayName);
	headers.set(CHATROOM_AUTH_IS_GUEST_HEADER, identity.isGuest ? "true" : "false");
}

/** Identity attested by the web worker (requires valid internal secret on the same request). */
export function readChatIdentityHeaders(headers: Headers): ChatAttestedIdentity | null {
	const userId = headers.get(CHATROOM_AUTH_USER_ID_HEADER)?.trim();
	const displayName = headers.get(CHATROOM_AUTH_DISPLAY_NAME_HEADER)?.trim();
	if (!userId || !displayName) {
		return null;
	}
	const isGuest = headers.get(CHATROOM_AUTH_IS_GUEST_HEADER)?.trim().toLowerCase() === "true";
	return { userId, displayName, isGuest };
}

/**
 * Workers-only `RequestInit` field for forwarding a browser WebSocket upgrade via `fetch()`.
 * Not part of standard DOM typings (`RequestInit` has no `duplex`).
 */
export type WebSocketForwardRequestInit = RequestInit & { duplex: "half" };

/** Forward a WebSocket upgrade to another worker/DO URL with replaced headers. */
export function buildWebSocketForwardRequest(
	url: string | URL,
	source: Request,
	headers: Headers,
): Request {
	const init: WebSocketForwardRequestInit = {
		headers,
		method: source.method,
		duplex: "half",
	};
	return new Request(url, init);
}

const chatDisplayNameZ = z.string().min(1).max(PROFILE_NAME_MAX_CHARS);

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
