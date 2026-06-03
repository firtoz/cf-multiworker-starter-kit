import {
	CHAT_HISTORY_INITIAL_PAGE_SIZE,
	CHATROOM_INTERNAL_SECRET_HEADER,
	type ChatHistoryCursor,
	type ChatHistoryPage,
	sanitizeChatRoomId,
} from "@internal/chat-contract";
import { bindingHonoClient } from "~/lib/bound-worker-hono-client";
import type { ChatroomBindingEnv } from "~/lib/chatroom-worker-hono-client";

export type ChatroomHistoryEnv = ChatroomBindingEnv;
export type ChatRoomHistoryOptions = {
	limit?: number;
	cursor?: ChatHistoryCursor | undefined;
};

function internalHeaders(env: ChatroomHistoryEnv): Headers {
	const headers = new Headers();
	headers.set(CHATROOM_INTERNAL_SECRET_HEADER, env.CHATROOM_INTERNAL_SECRET);
	return headers;
}

export async function listChatRoomHistory(
	env: ChatroomHistoryEnv,
	roomId: string,
	options: ChatRoomHistoryOptions = {},
): Promise<ChatHistoryPage> {
	const api = bindingHonoClient(env.CHATROOM);
	const limit = options.limit ?? CHAT_HISTORY_INITIAL_PAGE_SIZE;
	const query = {
		limit: String(limit),
		...(options.cursor
			? {
					beforeTs: String(options.cursor.beforeTs),
					beforeId: options.cursor.beforeId,
				}
			: {}),
	};
	const res = await api.get({
		url: "/rooms/:room/history",
		params: { room: sanitizeChatRoomId(roomId) },
		query,
		init: { headers: internalHeaders(env) },
	});
	if (!res.ok) {
		throw new Error("Could not load chat room history");
	}
	const body = await res.json();
	return body;
}
