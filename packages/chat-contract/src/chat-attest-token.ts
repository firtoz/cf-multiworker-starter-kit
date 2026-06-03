import type { ChatAttestedIdentity } from "./attested-identity";

export const CHAT_ATTEST_QUERY_PARAM = "attest" as const;

type ChatAttestPayload = {
	userId: string;
	displayName: string;
	isGuest: boolean;
	room: string;
	exp: number;
};

const DEFAULT_TTL_MS = 5 * 60 * 1000;

function encodeBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]!);
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): Uint8Array {
	const padded = value.replace(/-/g, "+").replace(/_/g, "/");
	const padLen = (4 - (padded.length % 4)) % 4;
	const binary = atob(padded + "=".repeat(padLen));
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		out[i] = binary.charCodeAt(i);
	}
	return out;
}

async function hmacSha256Base64Url(secret: string, message: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
	return encodeBase64Url(new Uint8Array(sig));
}

/** Mint a short-lived WS attest token (room-scoped) so the web worker skips AUTH `getSession` on upgrade. */
export async function createChatAttestToken(
	identity: ChatAttestedIdentity,
	room: string,
	secret: string,
	ttlMs = DEFAULT_TTL_MS,
): Promise<string> {
	const payload: ChatAttestPayload = {
		userId: identity.userId,
		displayName: identity.displayName,
		isGuest: identity.isGuest,
		room,
		exp: Date.now() + ttlMs,
	};
	const body = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
	const sig = await hmacSha256Base64Url(secret, body);
	return `${body}.${sig}`;
}

export async function verifyChatAttestToken(
	token: string,
	room: string,
	secret: string,
): Promise<ChatAttestedIdentity | null> {
	const dot = token.lastIndexOf(".");
	if (dot <= 0) {
		return null;
	}
	const body = token.slice(0, dot);
	const sig = token.slice(dot + 1);
	const expected = await hmacSha256Base64Url(secret, body);
	if (sig.length !== expected.length) {
		return null;
	}
	let mismatch = 0;
	for (let i = 0; i < sig.length; i++) {
		mismatch |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
	}
	if (mismatch !== 0) {
		return null;
	}
	try {
		const parsed = JSON.parse(new TextDecoder().decode(decodeBase64Url(body))) as ChatAttestPayload;
		if (
			typeof parsed.userId !== "string" ||
			typeof parsed.displayName !== "string" ||
			typeof parsed.isGuest !== "boolean" ||
			typeof parsed.room !== "string" ||
			typeof parsed.exp !== "number" ||
			parsed.exp < Date.now() ||
			parsed.room !== room
		) {
			return null;
		}
		return {
			userId: parsed.userId,
			displayName: parsed.displayName,
			isGuest: parsed.isGuest,
		};
	} catch {
		return null;
	}
}
