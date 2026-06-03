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

export function roomFromQueryParams(sp: { get: (key: string) => string | null }): string {
	const r = sp.get("room");
	return r ? sanitizeChatRoomId(r) : "lobby";
}
