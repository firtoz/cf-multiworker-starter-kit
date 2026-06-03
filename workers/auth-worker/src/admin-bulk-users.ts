import type { AuthDb } from "@internal/auth-db";
import { user as userTable } from "@internal/auth-db/schema";
import { eq, inArray } from "drizzle-orm";

export type BulkUsersValidation = { ok: true } | { ok: false; error: string };

/** Validate bulk delete before an atomic D1 batch. */
export async function validateBulkDeleteUsers(
	db: AuthDb,
	actorUserId: string,
	userIds: string[],
): Promise<BulkUsersValidation> {
	if (userIds.length === 0) {
		return { ok: false, error: "No users selected" };
	}
	if (userIds.includes(actorUserId)) {
		return { ok: false, error: "Cannot include your own account" };
	}

	const uniqueIds = [...new Set(userIds)];
	if (uniqueIds.length !== userIds.length) {
		return { ok: false, error: "Duplicate user ids in request" };
	}

	const [targets, admins] = await Promise.all([
		db
			.select({ id: userTable.id, role: userTable.role })
			.from(userTable)
			.where(inArray(userTable.id, uniqueIds)),
		db.select({ id: userTable.id }).from(userTable).where(eq(userTable.role, "admin")),
	]);

	if (targets.length !== uniqueIds.length) {
		return { ok: false, error: "One or more users were not found" };
	}

	const deletingAdminCount = targets.filter((row) => row.role === "admin").length;
	if (admins.length - deletingAdminCount < 1) {
		return { ok: false, error: "Cannot delete the last admin" };
	}

	return { ok: true };
}

/** Validate bulk role change before an atomic D1 batch. */
export async function validateBulkSetUserRoles(
	db: AuthDb,
	userIds: string[],
	role: "user" | "admin",
): Promise<BulkUsersValidation> {
	if (userIds.length === 0) {
		return { ok: false, error: "No users selected" };
	}

	const uniqueIds = [...new Set(userIds)];
	if (uniqueIds.length !== userIds.length) {
		return { ok: false, error: "Duplicate user ids in request" };
	}

	const targets = await db
		.select({ id: userTable.id, role: userTable.role })
		.from(userTable)
		.where(inArray(userTable.id, uniqueIds));

	if (targets.length !== uniqueIds.length) {
		return { ok: false, error: "One or more users were not found" };
	}

	if (role === "user") {
		const admins = await db
			.select({ id: userTable.id })
			.from(userTable)
			.where(eq(userTable.role, "admin"));
		const demotingAdminCount = targets.filter((row) => row.role === "admin").length;
		if (admins.length - demotingAdminCount < 1) {
			return { ok: false, error: "Cannot demote the last admin" };
		}
	}

	return { ok: true };
}

export async function bulkDeleteUsers(db: AuthDb, userIds: string[]): Promise<void> {
	const uniqueIds = [...new Set(userIds)];
	if (uniqueIds.length === 0) {
		return;
	}
	const statements = uniqueIds.map((id) => db.delete(userTable).where(eq(userTable.id, id)));
	if (statements.length === 1) {
		await statements[0];
		return;
	}
	type BatchArg = Parameters<AuthDb["batch"]>[0];
	await db.batch(statements as unknown as BatchArg);
}

export async function bulkSetUserRoles(
	db: AuthDb,
	userIds: string[],
	role: "user" | "admin",
): Promise<void> {
	const uniqueIds = [...new Set(userIds)];
	if (uniqueIds.length === 0) {
		return;
	}
	const statements = uniqueIds.map((id) =>
		db.update(userTable).set({ role }).where(eq(userTable.id, id)),
	);
	if (statements.length === 1) {
		await statements[0];
		return;
	}
	type BatchArg = Parameters<AuthDb["batch"]>[0];
	await db.batch(statements as unknown as BatchArg);
}
