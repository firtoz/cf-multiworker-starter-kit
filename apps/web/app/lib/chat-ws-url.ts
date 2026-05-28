/** Build `wss://…/api/ws/<room>` for Socka (web → chatroom worker → DO). */
export function buildChatWsUrl(room: string): string {
	const u = new URL(window.location.href);
	u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
	const r = sanitizeChatRoomId(room);
	u.pathname = `/api/ws/${encodeURIComponent(r)}`;
	u.search = "";
	return u.toString();
}

/** Spaces become dashes so typed names like "my room" work as room ids. */
export function normalizeChatRoomIdInput(raw: string): string {
	return raw.replace(/\s+/g, "-");
}

export function sanitizeChatRoomId(raw: string): string {
	const t = normalizeChatRoomIdInput(raw).trim().toLowerCase().slice(0, 64);
	if (t.length === 0) {
		return "lobby";
	}
	if (!/^[a-z0-9_-]+$/.test(t)) {
		return "lobby";
	}
	return t;
}

/** False when non-empty input contains characters that will not be used (only a-z, 0-9, _, -). */
export function isChatRoomIdInputValid(raw: string): boolean {
	const t = normalizeChatRoomIdInput(raw).trim().toLowerCase();
	if (t.length === 0) {
		return true;
	}
	return t.length <= 64 && /^[a-z0-9_-]+$/.test(t);
}
