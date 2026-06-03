import {
	CHATROOM_INTERNAL_SECRET_HEADER,
	type ChatMessageRow,
	sanitizeChatRoomId,
} from "@internal/chat-contract";
import { bindingHonoClient } from "~/lib/bound-worker-hono-client";
import type { ChatroomBindingEnv } from "~/lib/chatroom-worker-hono-client";

export type ChatroomHistoryEnv = ChatroomBindingEnv;

function internalHeaders(env: ChatroomHistoryEnv): Headers {
	const headers = new Headers();
	headers.set(CHATROOM_INTERNAL_SECRET_HEADER, env.CHATROOM_INTERNAL_SECRET);
	return headers;
}

export async function listChatRoomHistory(
	env: ChatroomHistoryEnv,
	roomId: string,
	limit = 200,
): Promise<ChatMessageRow[]> {
	const api = bindingHonoClient(env.CHATROOM);
	const res = await api.get({
		url: "/rooms/:room/history",
		params: { room: sanitizeChatRoomId(roomId) },
		query: { limit: String(limit) },
		init: { headers: internalHeaders(env) },
	});
	if (!res.ok) {
		throw new Error("Could not load chat room history");
	}
	const body = await res.json();
	return body.messages;
}
