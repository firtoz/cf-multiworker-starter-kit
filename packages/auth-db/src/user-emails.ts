import { and, eq, ne } from "drizzle-orm";
import type { AuthDb } from "./index";
import { account, userEmail, user as userTable } from "./schema";

export type UserEmailSource = "email" | "google" | "github" | "manual" | "profile";

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

/** Decode email claim from a stored OAuth id_token (no signature verification). */
export function emailFromOAuthIdToken(idToken: string | null | undefined): string | null {
	if (!idToken) {
		return null;
	}
	const parts = idToken.split(".");
	if (parts.length < 2) {
		return null;
	}
	try {
		const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))) as {
			email?: string;
		};
		return typeof payload.email === "string" ? normalizeEmail(payload.email) : null;
	} catch {
		return null;
	}
}

export async function upsertUserEmail(
	db: AuthDb,
	userId: string,
	rawEmail: string,
	source: UserEmailSource,
	verified = true,
): Promise<string | null> {
	const email = normalizeEmail(rawEmail);
	if (!email.includes("@")) {
		return null;
	}

	const [conflict] = await db
		.select({ id: userEmail.id, userId: userEmail.userId })
		.from(userEmail)
		.where(eq(userEmail.email, email))
		.limit(1);

	if (conflict && conflict.userId !== userId) {
		return null;
	}

	const [existing] = await db
		.select()
		.from(userEmail)
		.where(and(eq(userEmail.userId, userId), eq(userEmail.email, email)))
		.limit(1);

	if (existing) {
		await db
			.update(userEmail)
			.set({
				source,
				verified: existing.verified || verified,
				updatedAt: new Date(),
			})
			.where(eq(userEmail.id, existing.id));
		return existing.id;
	}

	const id = crypto.randomUUID();
	const preferredRows = await db
		.select({ id: userEmail.id })
		.from(userEmail)
		.where(and(eq(userEmail.userId, userId), eq(userEmail.isNotificationPreferred, true)))
		.limit(1);

	await db.insert(userEmail).values({
		id,
		userId,
		email,
		source,
		verified,
		isNotificationPreferred: preferredRows.length === 0,
	});

	return id;
}

export async function syncUserEmailsForUser(db: AuthDb, userId: string) {
	const [row] = await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1);
	if (!row) {
		return;
	}

	const accounts = await db.select().from(account).where(eq(account.userId, userId));

	await upsertUserEmail(db, userId, row.email, "profile", row.emailVerified);

	const hasCredential = accounts.some((a) => a.providerId === "credential");
	if (hasCredential) {
		await upsertUserEmail(db, userId, row.email, "email", row.emailVerified);
	}

	for (const acc of accounts) {
		if (acc.providerId === "google" || acc.providerId === "github") {
			const oauthEmail = emailFromOAuthIdToken(acc.idToken);
			if (oauthEmail) {
				await upsertUserEmail(db, userId, oauthEmail, acc.providerId, true);
			}
		}
	}

	// Better Auth often omits id_token on the account row; first OAuth sign-in still sets user.email.
	const oauthAccounts = accounts.filter(
		(a) => a.providerId === "google" || a.providerId === "github",
	);
	if (!hasCredential && oauthAccounts.length > 0) {
		for (const acc of oauthAccounts) {
			if (acc.providerId !== "google" && acc.providerId !== "github") {
				continue;
			}
			const existing = await db
				.select({ id: userEmail.id })
				.from(userEmail)
				.where(and(eq(userEmail.userId, userId), eq(userEmail.source, acc.providerId)))
				.limit(1);
			if (existing.length === 0) {
				await upsertUserEmail(db, userId, row.email, acc.providerId, row.emailVerified);
			}
		}
	}
}

export async function setNotificationPreferredEmail(
	db: AuthDb,
	userId: string,
	emailId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const [target] = await db
		.select()
		.from(userEmail)
		.where(and(eq(userEmail.id, emailId), eq(userEmail.userId, userId)))
		.limit(1);

	if (!target) {
		return { ok: false, error: "Email not found on your account" };
	}

	await db
		.update(userEmail)
		.set({ isNotificationPreferred: false, updatedAt: new Date() })
		.where(eq(userEmail.userId, userId));

	await db
		.update(userEmail)
		.set({ isNotificationPreferred: true, updatedAt: new Date() })
		.where(eq(userEmail.id, emailId));

	return { ok: true };
}

export async function setSignInEmail(
	db: AuthDb,
	userId: string,
	emailId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const [target] = await db
		.select()
		.from(userEmail)
		.where(and(eq(userEmail.id, emailId), eq(userEmail.userId, userId)))
		.limit(1);

	if (!target) {
		return { ok: false, error: "Email not found on your account" };
	}

	const [userConflict] = await db
		.select({ id: userTable.id })
		.from(userTable)
		.where(and(eq(userTable.email, target.email), ne(userTable.id, userId)))
		.limit(1);

	if (userConflict) {
		return { ok: false, error: "That email is already the sign-in address for another account" };
	}

	await db
		.update(userTable)
		.set({ email: target.email, updatedAt: new Date() })
		.where(eq(userTable.id, userId));

	return { ok: true };
}

export async function addManualUserEmail(
	db: AuthDb,
	userId: string,
	rawEmail: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
	const email = normalizeEmail(rawEmail);
	if (!email.includes("@")) {
		return { ok: false, error: "Invalid email address" };
	}

	const [conflict] = await db
		.select({ userId: userEmail.userId })
		.from(userEmail)
		.where(eq(userEmail.email, email))
		.limit(1);

	if (conflict && conflict.userId !== userId) {
		return { ok: false, error: "That email is already used by another account" };
	}

	const id = await upsertUserEmail(db, userId, email, "manual", false);
	if (!id) {
		return { ok: false, error: "Could not add email" };
	}
	return { ok: true, id };
}
