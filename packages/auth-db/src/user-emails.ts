import { and, eq, inArray, ne } from "drizzle-orm";
import type { AuthDb } from "./index";
import { account, userEmail, user as userTable } from "./schema";

export type UserEmailSource = "email" | "google" | "github" | "manual" | "profile";

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

type EmailUpsertTarget = {
	email: string;
	source: UserEmailSource;
	verified: boolean;
};

/** Emails owned by a different user (sign-in address or stored notification email). */
async function findConflictEmailsForUser(
	db: AuthDb,
	rawEmails: readonly string[],
	excludeUserId: string,
): Promise<Set<string>> {
	const emails = [...new Set(rawEmails.map(normalizeEmail).filter((e) => e.includes("@")))];
	if (emails.length === 0) {
		return new Set();
	}

	const [userConflicts, emailConflicts] = await Promise.all([
		db
			.select({ email: userTable.email })
			.from(userTable)
			.where(and(inArray(userTable.email, emails), ne(userTable.id, excludeUserId))),
		db
			.select({ email: userEmail.email })
			.from(userEmail)
			.where(and(inArray(userEmail.email, emails), ne(userEmail.userId, excludeUserId))),
	]);

	const conflicts = new Set<string>();
	for (const row of userConflicts) {
		conflicts.add(normalizeEmail(row.email));
	}
	for (const row of emailConflicts) {
		conflicts.add(normalizeEmail(row.email));
	}
	return conflicts;
}

/** Another account already owns this address (sign-in email or any stored notification email). */
export async function findOtherUserIdForEmail(
	db: AuthDb,
	rawEmail: string,
	excludeUserId?: string | null,
): Promise<string | null> {
	const email = normalizeEmail(rawEmail);
	if (!email.includes("@")) {
		return null;
	}

	const userWhere = excludeUserId
		? and(eq(userTable.email, email), ne(userTable.id, excludeUserId))
		: eq(userTable.email, email);
	const [userRow] = await db.select({ id: userTable.id }).from(userTable).where(userWhere).limit(1);
	if (userRow) {
		return userRow.id;
	}

	const emailWhere = excludeUserId
		? and(eq(userEmail.email, email), ne(userEmail.userId, excludeUserId))
		: eq(userEmail.email, email);
	const [emailRow] = await db
		.select({ userId: userEmail.userId })
		.from(userEmail)
		.where(emailWhere)
		.limit(1);
	return emailRow?.userId ?? null;
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

	if (await findOtherUserIdForEmail(db, email, userId)) {
		return null;
	}

	const [existing] = await db
		.select()
		.from(userEmail)
		.where(and(eq(userEmail.userId, userId), eq(userEmail.source, source)))
		.limit(1);

	if (existing) {
		const nextVerified = existing.verified || verified;
		if (existing.email === email && nextVerified === existing.verified) {
			return existing.id;
		}
		await db
			.update(userEmail)
			.set({
				email,
				verified: nextVerified,
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

function oauthProviderEmailFromAccount(
	acc: { providerId: string; idToken: string | null },
	profileEmail: string,
	profileIsAnonymous: boolean,
): string | null {
	const fromToken = emailFromOAuthIdToken(acc.idToken);
	if (fromToken) {
		return fromToken;
	}
	if (!profileIsAnonymous && profileEmail.includes("@")) {
		return profileEmail;
	}
	return null;
}

function buildSyncTargets(
	row: typeof userTable.$inferSelect,
	accounts: (typeof account.$inferSelect)[],
): EmailUpsertTarget[] {
	const profileEmail = normalizeEmail(row.email);
	const anonymous = row.isAnonymous === true;
	const targets: EmailUpsertTarget[] = [];

	if (!anonymous) {
		targets.push({ email: profileEmail, source: "profile", verified: row.emailVerified });
	}

	if (accounts.some((a) => a.providerId === "credential")) {
		targets.push({ email: profileEmail, source: "email", verified: row.emailVerified });
	}

	for (const acc of accounts) {
		if (acc.providerId !== "google" && acc.providerId !== "github") {
			continue;
		}
		const oauthEmail = oauthProviderEmailFromAccount(acc, profileEmail, anonymous);
		if (oauthEmail) {
			targets.push({
				email: oauthEmail,
				source: acc.providerId as "google" | "github",
				verified: true,
			});
		}
	}

	return targets;
}

export async function syncUserEmailsForUser(db: AuthDb, userId: string) {
	const [[row], accounts] = await Promise.all([
		db.select().from(userTable).where(eq(userTable.id, userId)).limit(1),
		db.select().from(account).where(eq(account.userId, userId)),
	]);
	if (!row) {
		return;
	}

	const targets = buildSyncTargets(row, accounts);
	if (targets.length === 0) {
		return;
	}

	const conflictEmails = await findConflictEmailsForUser(
		db,
		targets.map((t) => t.email),
		userId,
	);
	const existingRows = await db.select().from(userEmail).where(eq(userEmail.userId, userId));
	const existingBySource = new Map(existingRows.map((r) => [r.source, r]));
	let hasPreferred = existingRows.some((r) => r.isNotificationPreferred);

	for (const target of targets) {
		if (conflictEmails.has(target.email)) {
			continue;
		}

		const existing = existingBySource.get(target.source);
		if (existing) {
			const nextVerified = existing.verified || target.verified;
			if (existing.email === target.email && nextVerified === existing.verified) {
				continue;
			}
			await db
				.update(userEmail)
				.set({
					email: target.email,
					verified: nextVerified,
					updatedAt: new Date(),
				})
				.where(eq(userEmail.id, existing.id));
			existingBySource.set(target.source, {
				...existing,
				email: target.email,
				verified: nextVerified,
			});
			continue;
		}

		const id = crypto.randomUUID();
		const isNotificationPreferred = !hasPreferred;
		if (isNotificationPreferred) {
			hasPreferred = true;
		}

		await db.insert(userEmail).values({
			id,
			userId,
			email: target.email,
			source: target.source,
			verified: target.verified,
			isNotificationPreferred,
		});
		existingBySource.set(target.source, {
			id,
			userId,
			email: target.email,
			source: target.source,
			verified: target.verified,
			isNotificationPreferred,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
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

	const userConflict = await findOtherUserIdForEmail(db, target.email, userId);

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

	const conflict = await findOtherUserIdForEmail(db, email, userId);

	if (conflict) {
		return { ok: false, error: "That email is already used by another account" };
	}

	const id = await upsertUserEmail(db, userId, email, "manual", false);
	if (!id) {
		return { ok: false, error: "Could not add email" };
	}
	return { ok: true, id };
}
