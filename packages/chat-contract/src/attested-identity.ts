import { CHAT_DISPLAY_NAME_MAX_CHARS } from "./limits";

export type ChatAttestedIdentity = {
	userId: string;
	displayName: string;
	isGuest: boolean;
};

/** Signed-in user facts from AUTH — mapped after `getSession` on the web worker (chat WS entry). */
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

/** Resolve chat presence after the chatroom worker reads the session from the AUTH binding. */
export function resolveChatAttestedIdentity(signedIn: ChatSignedInIdentity): ChatAttestedIdentity {
	const profileName = signedIn.profileDisplayName?.trim();
	const displayName = profileName ? clampDisplayName(profileName) : clampDisplayName("Guest");
	return {
		userId: signedIn.userId,
		displayName,
		isGuest: signedIn.isAnonymous,
	};
}
