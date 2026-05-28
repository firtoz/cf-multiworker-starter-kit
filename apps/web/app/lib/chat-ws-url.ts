/** Build `wss://…/api/ws/<room>` for Socka (web → chatroom worker → DO). */
export function buildChatWsUrl(room: string): string {
	const u = new URL(window.location.href);
	u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
	const r = sanitizeChatRoomId(room);
	u.pathname = `/api/ws/${encodeURIComponent(r)}`;
	u.search = "";
	return u.toString();
}

export function sanitizeChatRoomId(raw: string): string {
	const t = raw.trim().toLowerCase().slice(0, 64);
	if (t.length === 0) {
		return "lobby";
	}
	if (!/^[a-z0-9_-]+$/.test(t)) {
		return "lobby";
	}
	return t;
}
