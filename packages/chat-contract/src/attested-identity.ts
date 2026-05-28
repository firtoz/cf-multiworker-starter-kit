import { CHAT_DISPLAY_NAME_MAX_CHARS } from "./limits";

export type ChatAttestedIdentity = {
	userId: string;
	displayName: string;
	isGuest: boolean;
};

/** Signed-in user facts from AUTH — mapped by the web worker before WS forward. */
export type ChatSignedInIdentity = {
	userId: string;
	profileDisplayName: string | null;
	/** Better Auth anonymous guest (faded name in UI, stable id while session lasts). */
	isAnonymous: boolean;
};

function clampDisplayName(raw: string): string {
	return raw.length <= CHAT_DISPLAY_NAME_MAX_CHARS
		? raw
		: raw.slice(0, CHAT_DISPLAY_NAME_MAX_CHARS);
}

function clampGuestDisplayName(raw: string | null): string {
	const base = raw?.trim() || "Guest";
	return clampDisplayName(base);
}

/** Resolve chat presence on the web worker before forwarding `/api/ws/*`. */
export function resolveChatAttestedIdentity(
	signedIn: ChatSignedInIdentity | null,
	guestNameQuery: string | null,
): ChatAttestedIdentity {
	if (signedIn) {
		const profileName = signedIn.profileDisplayName?.trim();
		const displayName = profileName
			? clampDisplayName(profileName)
			: clampGuestDisplayName(guestNameQuery);
		return {
			userId: signedIn.userId,
			displayName,
			isGuest: signedIn.isAnonymous,
		};
	}
	return {
		userId: crypto.randomUUID(),
		displayName: clampGuestDisplayName(guestNameQuery),
		isGuest: true,
	};
}
