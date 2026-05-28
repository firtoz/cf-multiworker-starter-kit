import {
	type AuthDb,
	emailFromOAuthIdToken,
	getAuthDb,
	syncUserEmailsForUser,
} from "@internal/auth-db";
import { account, user as userTable } from "@internal/auth-db/schema";
import { eq } from "drizzle-orm";

export type GraduateAnonymousInput = {
	email: string;
	emailVerified?: boolean;
	name?: string | null;
	image?: string | null;
};

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
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
	if (!email.includes("@") || email.endsWith(".guest")) {
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

/** After OAuth is linked to an anonymous user, promote them using the provider email. */
export async function graduateAnonymousUserFromOAuthAccount(
	db: AuthDb,
	userId: string,
	providerId: string,
	idToken: string | null | undefined,
): Promise<void> {
	const [row] = await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1);
	if (!row?.isAnonymous) {
		return;
	}

	const fromToken = emailFromOAuthIdToken(idToken);
	if (fromToken) {
		const result = await graduateAnonymousUser(db, userId, {
			email: fromToken,
			emailVerified: true,
		});
		if (!result.ok) {
			throw new Error(result.error);
		}
		return;
	}

	const linked = await db.select().from(account).where(eq(account.userId, userId)).limit(10);
	const oauth = linked.find((a) => a.providerId === providerId);
	const fallbackEmail = oauth ? emailFromOAuthIdToken(oauth.idToken) : null;
	if (!fallbackEmail) {
		return;
	}
	const result = await graduateAnonymousUser(db, userId, {
		email: fallbackEmail,
		emailVerified: true,
	});
	if (!result.ok) {
		throw new Error(result.error);
	}
}

export function authDbFromEnv(dbBinding: D1Database): AuthDb {
	return getAuthDb(dbBinding);
}
