import {
	type AuthDb,
	emailDomain,
	emailFromOAuthIdToken,
	getAuthDb,
	isSyntheticGuestEmail,
	syncUserEmailsForUser,
} from "@internal/auth-db";
import { account, user as userTable } from "@internal/auth-db/schema";
import { decryptOAuthToken } from "better-auth/oauth2";
import { eq } from "drizzle-orm";

export type GraduateAnonymousInput = {
	email: string;
	emailVerified?: boolean;
	name?: string | null;
	image?: string | null;
};

/** Provider email from OAuth userInfo (link-social / oauth-proxy completion). */
export type OAuthLinkCompleted = {
	userId: string;
	providerId: string;
	email: string;
	emailVerified: boolean;
};

export type OAuthLinkGraduationInput = {
	userId: string;
	providerId: string;
	idToken?: string | null | undefined;
	accessToken?: string | null | undefined;
	providerEmail?: string | null | undefined;
	emailVerified?: boolean;
	/** Decrypts `accessToken` when Better Auth account.create.after passes stored tokens. */
	authSecret?: string;
};

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

async function decryptStoredOAuthAccessToken(
	token: string | null | undefined,
	authSecret: string | undefined,
): Promise<string | null> {
	if (!token || !authSecret) {
		return token ?? null;
	}
	return (
		(await decryptOAuthToken(token, {
			secretConfig: authSecret,
			options: { account: { encryptOAuthTokens: true } },
		} as Parameters<typeof decryptOAuthToken>[1])) ?? null
	);
}

async function fetchGitHubPrimaryEmail(accessToken: string): Promise<string | null> {
	const res = await fetch("https://api.github.com/user/emails", {
		headers: {
			Authorization: `Bearer ${accessToken}`,
			Accept: "application/vnd.github+json",
			"User-Agent": "cf-multiworker-starter-kit-auth",
		},
	});
	if (!res.ok) {
		return null;
	}
	const emails = (await res.json()) as Array<{
		email?: string;
		primary?: boolean;
		verified?: boolean;
	}>;
	const preferred =
		emails.find((entry) => entry.primary && entry.verified) ??
		emails.find((entry) => entry.verified) ??
		emails[0];
	return preferred?.email ? normalizeEmail(preferred.email) : null;
}

async function resolveOAuthGraduationEmail(
	input: OAuthLinkGraduationInput,
): Promise<string | null> {
	const fromToken = emailFromOAuthIdToken(input.idToken);
	if (fromToken) {
		return fromToken;
	}
	if (input.providerEmail?.trim()) {
		return normalizeEmail(input.providerEmail);
	}
	const accessToken = await decryptStoredOAuthAccessToken(input.accessToken, input.authSecret);
	if (!accessToken) {
		return null;
	}
	if (input.providerId === "github") {
		return fetchGitHubPrimaryEmail(accessToken);
	}
	return null;
}

export async function graduateAnonymousUser(
	db: AuthDb,
	userId: string,
	input: GraduateAnonymousInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const [row] = await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1);
	if (!row) {
		return { ok: false, error: "User not found" };
	}
	if (row.isAnonymous !== true) {
		return { ok: true };
	}

	const email = normalizeEmail(input.email);
	const guestDomain = emailDomain(row.email);
	if (!email.includes("@") || (guestDomain !== null && isSyntheticGuestEmail(email, guestDomain))) {
		return { ok: false, error: "A valid email is required to create your account" };
	}

	const [emailOwner] = await db
		.select({ id: userTable.id })
		.from(userTable)
		.where(eq(userTable.email, email))
		.limit(1);
	if (emailOwner && emailOwner.id !== userId) {
		return { ok: false, error: "That email is already registered — sign in instead" };
	}

	const patch: {
		email: string;
		isAnonymous: false;
		emailVerified: boolean;
		updatedAt: Date;
		name?: string;
		image?: string | null;
	} = {
		email,
		isAnonymous: false,
		emailVerified: input.emailVerified ?? row.emailVerified,
		updatedAt: new Date(),
	};

	const name = input.name?.trim();
	if (name) {
		patch.name = name;
	}
	if (input.image !== undefined) {
		patch.image = input.image;
	}

	await db.update(userTable).set(patch).where(eq(userTable.id, userId));
	await syncUserEmailsForUser(db, userId);
	return { ok: true };
}

/**
 * Promote an anonymous user after OAuth account linking.
 * Uses id_token email (Google OIDC), explicit provider email (oauth-proxy / link completion),
 * or GitHub API via access token when id_token is absent.
 */
export async function graduateAnonymousUserFromOAuthLink(
	db: AuthDb,
	input: OAuthLinkGraduationInput,
): Promise<void> {
	const [row] = await db.select().from(userTable).where(eq(userTable.id, input.userId)).limit(1);
	if (!row?.isAnonymous) {
		return;
	}

	let email = await resolveOAuthGraduationEmail(input);
	if (!email) {
		const linked = await db
			.select()
			.from(account)
			.where(eq(account.userId, input.userId))
			.limit(10);
		const oauth = linked.find((entry) => entry.providerId === input.providerId);
		if (oauth?.idToken) {
			email = emailFromOAuthIdToken(oauth.idToken);
		}
		if (!email && oauth?.accessToken) {
			email = await resolveOAuthGraduationEmail({
				...input,
				idToken: oauth.idToken,
				accessToken: oauth.accessToken,
			});
		}
	}

	if (!email) {
		throw new Error("OAuth provider did not yield an email to upgrade this guest account");
	}

	const result = await graduateAnonymousUser(db, input.userId, {
		email,
		emailVerified: input.emailVerified ?? true,
	});
	if (!result.ok) {
		throw new Error(result.error);
	}
}

/** @deprecated Use {@link graduateAnonymousUserFromOAuthLink}. */
export async function graduateAnonymousUserFromOAuthAccount(
	db: AuthDb,
	userId: string,
	providerId: string,
	idToken: string | null | undefined,
): Promise<void> {
	await graduateAnonymousUserFromOAuthLink(db, { userId, providerId, idToken });
}

export function authDbFromEnv(dbBinding: D1Database): AuthDb {
	return getAuthDb(dbBinding);
}
