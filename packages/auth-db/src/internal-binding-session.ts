import { PRODUCT_PREFIX } from "alchemy-utils/worker-peer-scripts";

/** HMAC-signed session snapshot for trusted web → auth service-binding calls (skips D1 `getSession`). */
export const INTERNAL_BINDING_SESSION_HEADER =
	`x-${PRODUCT_PREFIX}-internal-binding-session` as const;

const TOKEN_TTL_MS = 5 * 60 * 1000;

type InternalBindingSessionPayload = {
	userId: string;
	sessionId: string;
	email: string;
	role: string;
	isAnonymous: boolean;
	name?: string;
	exp: number;
};

export type InternalBindingSessionInput = {
	user: {
		id: string;
		email: string;
		role: string;
		name?: string | null;
		isAnonymous?: boolean;
	};
	session: {
		id: string;
	};
};

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

function sessionToPayload(session: InternalBindingSessionInput): InternalBindingSessionPayload {
	const name = session.user.name?.trim();
	return {
		userId: session.user.id,
		sessionId: session.session.id,
		email: session.user.email,
		role: session.user.role,
		isAnonymous: session.user.isAnonymous === true,
		...(name ? { name } : {}),
		exp: Date.now() + TOKEN_TTL_MS,
	};
}

/** Mint a short-lived token the auth worker trusts on `auth.internal` binding requests. */
export async function createInternalBindingSessionToken(
	session: InternalBindingSessionInput,
	secret: string,
): Promise<string> {
	const payload = sessionToPayload(session);
	const body = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
	const sig = await hmacSha256Base64Url(secret, body);
	return `${body}.${sig}`;
}

export async function verifyInternalBindingSessionToken(
	token: string,
	secret: string,
): Promise<InternalBindingSessionPayload | null> {
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
		const parsed = JSON.parse(
			new TextDecoder().decode(decodeBase64Url(body)),
		) as InternalBindingSessionPayload;
		if (
			typeof parsed.userId !== "string" ||
			typeof parsed.sessionId !== "string" ||
			typeof parsed.email !== "string" ||
			typeof parsed.role !== "string" ||
			typeof parsed.exp !== "number" ||
			parsed.exp < Date.now()
		) {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

/** Map verified binding token to Better Auth–compatible session shape for auth-worker handlers. */
export function internalBindingPayloadToAuthSession(payload: InternalBindingSessionPayload): {
	session: { id: string; userId: string; expiresAt: Date; createdAt: Date; updatedAt: Date };
	user: {
		id: string;
		email: string;
		name: string;
		image: string | null;
		role: string;
		isAnonymous: boolean | null;
		createdAt: Date;
		updatedAt: Date;
	};
} {
	const now = new Date();
	return {
		session: {
			id: payload.sessionId,
			userId: payload.userId,
			expiresAt: new Date(payload.exp),
			createdAt: now,
			updatedAt: now,
		},
		user: {
			id: payload.userId,
			email: payload.email,
			name: payload.name?.trim() ?? "",
			image: null,
			role: payload.role,
			isAnonymous: payload.isAnonymous ? true : null,
			createdAt: now,
			updatedAt: now,
		},
	};
}
