import { CHAT_ATTEST_QUERY_PARAM, sanitizeChatRoomId } from "@internal/chat-contract";

export {
	isChatRoomIdInputValid,
	normalizeChatRoomIdInput,
	roomFromQueryParams,
	sanitizeChatRoomId,
} from "@internal/chat-contract";

/** Build `wss://…/api/ws/<room>` for Socka (web → chatroom worker → DO). */
export function buildChatWsUrl(room: string, attestToken?: string): string {
	const u = new URL(window.location.href);
	u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
	const r = sanitizeChatRoomId(room);
	u.pathname = `/api/ws/${encodeURIComponent(r)}`;
	u.search = "";
	if (attestToken) {
		u.searchParams.set(CHAT_ATTEST_QUERY_PARAM, attestToken);
	}
	return u.toString();
}
