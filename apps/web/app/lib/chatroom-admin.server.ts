import {
	CHATROOM_ADMIN_USER_ID_HEADER,
	CHATROOM_INTERNAL_SECRET_HEADER,
} from "@internal/chat-contract";
import type { ChatroomAdminDeleteResult } from "@internal/chat-contract/admin-http";
import { bindingHonoClient } from "~/lib/bound-worker-hono-client";
import type { ChatroomBindingEnv } from "~/lib/chatroom-worker-hono-client";

export type ChatroomAdminEnv = ChatroomBindingEnv;

function adminHeaders(env: ChatroomAdminEnv, adminUserId: string): Headers {
	const headers = new Headers();
	headers.set(CHATROOM_INTERNAL_SECRET_HEADER, env.CHATROOM_INTERNAL_SECRET);
	headers.set(CHATROOM_ADMIN_USER_ID_HEADER, adminUserId);
	return headers;
}

export async function deleteChatRoomMessageForAdmin(
	env: ChatroomAdminEnv,
	roomId: string,
	messageId: string,
	adminUserId: string,
): Promise<ChatroomAdminDeleteResult> {
	const api = bindingHonoClient(env.CHATROOM);
	const res = await api.delete({
		url: "/admin/messages/:messageId",
		params: { messageId },
		query: { room: roomId },
		init: { headers: adminHeaders(env, adminUserId) },
	});
	return res.json();
}
