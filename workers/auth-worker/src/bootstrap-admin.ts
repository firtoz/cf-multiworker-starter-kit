import type { AuthDb } from "@internal/auth-db";
import { userEmail, user as userTable } from "@internal/auth-db/schema";
import { and, eq, inArray, ne, or, sql } from "drizzle-orm";

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function emailMatchCondition(
	column: typeof userTable.email | typeof userEmail.email,
	emails: readonly string[],
) {
	return or(...emails.map((email) => sql`lower(${column}) = ${email}`));
}

async function emailsForUser(db: AuthDb, userId: string): Promise<Set<string>> {
	const out = new Set<string>();
	const [user] = await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1);
	if (user?.email?.trim()) {
		out.add(normalizeEmail(user.email));
	}
	const rows = await db
		.select({ email: userEmail.email })
		.from(userEmail)
		.where(eq(userEmail.userId, userId));
	for (const row of rows) {
		if (row.email?.trim()) {
			out.add(normalizeEmail(row.email));
		}
	}
	return out;
}

/** Promote one user when any stored address matches the bootstrap list (sign-up / OAuth link). */
export async function ensureBootstrapAdminRole(
	db: AuthDb,
	userId: string,
	bootstrap: Set<string>,
): Promise<void> {
	if (bootstrap.size === 0) {
		return;
	}
	const [user] = await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1);
	if (!user || user.role === "admin") {
		return;
	}
	const emails = await emailsForUser(db, userId);
	for (const email of emails) {
		if (bootstrap.has(email)) {
			await db.update(userTable).set({ role: "admin" }).where(eq(userTable.id, userId));
			return;
		}
	}
}

/** Bulk-promote existing users matching the bootstrap list (post-deploy `POST /admin/bootstrap-sync`). */
export async function promoteAllMatchingBootstrapAdmins(
	db: AuthDb,
	bootstrap: Set<string>,
): Promise<number> {
	if (bootstrap.size === 0) {
		return 0;
	}
	const list = [...bootstrap];
	const matchUserEmail = emailMatchCondition(userTable.email, list);
	const matchContactEmail = emailMatchCondition(userEmail.email, list);

	const [fromLogin, fromContacts] = await Promise.all([
		db
			.select({ id: userTable.id })
			.from(userTable)
			.where(and(matchUserEmail, ne(userTable.role, "admin"))),
		db.select({ userId: userEmail.userId }).from(userEmail).where(matchContactEmail),
	]);

	const ids = [...new Set([...fromLogin.map((r) => r.id), ...fromContacts.map((r) => r.userId)])];
	if (ids.length === 0) {
		return 0;
	}

	await db
		.update(userTable)
		.set({ role: "admin" })
		.where(and(inArray(userTable.id, ids), ne(userTable.role, "admin")));

	return ids.length;
}
