import { AUTH_ADMIN_SECRET_HEADER, parseAuthRole } from "@internal/auth-client";
import { getAuthDb, session as sessionTable, user as userTable } from "@internal/auth-db";
import {
	type AdminUserSessionActivity,
	adminAddOriginSchema,
	adminSetOriginsSchema,
	adminSetRoleSchema,
	adminSetUserNameSchema,
	parseTimestampOrNull,
	toAdminUserRowWire,
} from "@internal/auth-db/api-schemas";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import type { createAuth } from "./auth";
import {
	appendTrustedOrigin,
	getTrustedOrigins,
	removeTrustedOrigin,
	setTrustedOrigins,
} from "./origins";

type AuthInstance = ReturnType<typeof createAuth>;

import type { CloudflareEnv } from "../env";

type AppVariables = {
	auth: AuthInstance;
	trustedOrigins: string[];
};

function aggregateSessionActivity(
	sessions: { userId: string; updatedAt: unknown; expiresAt: unknown }[],
	nowMs: number,
): Map<string, AdminUserSessionActivity> {
	const map = new Map<string, AdminUserSessionActivity>();
	for (const s of sessions) {
		const updatedAt = parseTimestampOrNull(s.updatedAt);
		const expiresAt = parseTimestampOrNull(s.expiresAt);
		let entry = map.get(s.userId);
		if (!entry) {
			entry = { lastSeenAt: null, sessionExpiresAt: null };
			map.set(s.userId, entry);
		}
		if (updatedAt && (!entry.lastSeenAt || updatedAt > entry.lastSeenAt)) {
			entry.lastSeenAt = updatedAt;
		}
		if (expiresAt && expiresAt.getTime() > nowMs) {
			if (!entry.sessionExpiresAt || expiresAt > entry.sessionExpiresAt) {
				entry.sessionExpiresAt = expiresAt;
			}
		}
	}
	return map;
}

export async function assertAdminAccess(
	c: Context<{ Bindings: CloudflareEnv; Variables: AppVariables }>,
): Promise<Response | null> {
	const secretHeader = c.req.header(AUTH_ADMIN_SECRET_HEADER);
	if (secretHeader && secretHeader === c.env.AUTH_ADMIN_SECRET) {
		return null;
	}
	const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
	const role = session?.user ? parseAuthRole((session.user as { role?: unknown }).role) : "user";
	if (!session?.user || role !== "admin") {
		return c.json({ error: "Forbidden" }, 403);
	}
	return null;
}

export function registerAdminRoutes(
	app: import("hono").Hono<{ Bindings: CloudflareEnv; Variables: AppVariables }>,
) {
	app.get("/admin/origins", async (c) => {
		const denied = await assertAdminAccess(c);
		if (denied) {
			return denied;
		}
		const origins = await getTrustedOrigins(c.env.AUTH_KV);
		return c.json({ origins });
	});

	app.post("/admin/origins", async (c) => {
		const denied = await assertAdminAccess(c);
		if (denied) {
			return denied;
		}
		const body = await c.req.json().catch(() => null);
		const parsed = adminSetOriginsSchema.safeParse(body);
		if (!parsed.success) {
			return c.json({ error: "origins array required" }, 400);
		}
		await setTrustedOrigins(c.env.AUTH_KV, parsed.data.origins);
		return c.json({ origins: parsed.data.origins });
	});

	app.post("/admin/origins/add", async (c) => {
		const denied = await assertAdminAccess(c);
		if (denied) {
			return denied;
		}
		const body = await c.req.json().catch(() => null);
		const parsed = adminAddOriginSchema.safeParse(body);
		if (!parsed.success) {
			return c.json({ error: "origin required" }, 400);
		}
		const origins = await appendTrustedOrigin(c.env.AUTH_KV, parsed.data.origin);
		return c.json({ origins });
	});

	app.delete("/admin/origins/:origin", async (c) => {
		const denied = await assertAdminAccess(c);
		if (denied) {
			return denied;
		}
		const origin = decodeURIComponent(c.req.param("origin"));
		const origins = await removeTrustedOrigin(c.env.AUTH_KV, origin);
		return c.json({ origins });
	});

	app.get("/admin/users", async (c) => {
		const denied = await assertAdminAccess(c);
		if (denied) {
			return denied;
		}
		const db = getAuthDb(c.env.DB);
		const nowMs = Date.now();
		const [rows, sessions] = await Promise.all([
			db.select().from(userTable),
			db
				.select({
					userId: sessionTable.userId,
					updatedAt: sessionTable.updatedAt,
					expiresAt: sessionTable.expiresAt,
				})
				.from(sessionTable),
		]);
		const activityByUser = aggregateSessionActivity(sessions, nowMs);
		return c.json({
			users: rows.map((r) => toAdminUserRowWire(r, activityByUser.get(r.id))),
		});
	});

	app.post("/admin/users/:id/role", async (c) => {
		const denied = await assertAdminAccess(c);
		if (denied) {
			return denied;
		}
		const body = await c.req.json().catch(() => null);
		const parsed = adminSetRoleSchema.safeParse(body);
		if (!parsed.success) {
			return c.json({ error: "role must be user or admin" }, 400);
		}
		const db = getAuthDb(c.env.DB);
		const userId = c.req.param("id");

		if (parsed.data.role === "user") {
			const admins = await db.select().from(userTable).where(eq(userTable.role, "admin"));
			const target = admins.find((a) => a.id === userId);
			if (target && admins.length <= 1) {
				return c.json({ error: "Cannot demote the last admin" }, 400);
			}
		}

		await db.update(userTable).set({ role: parsed.data.role }).where(eq(userTable.id, userId));
		return c.json({ ok: true as const });
	});

	app.delete("/admin/users/:id", async (c) => {
		const denied = await assertAdminAccess(c);
		if (denied) {
			return denied;
		}
		const userId = c.req.param("id");
		const db = getAuthDb(c.env.DB);

		const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
		if (session?.user?.id === userId) {
			return c.json({ error: "Cannot delete your own account" }, 400);
		}

		const [target] = await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1);
		if (!target) {
			return c.json({ error: "User not found" }, 404);
		}

		if (target.role === "admin") {
			const admins = await db.select().from(userTable).where(eq(userTable.role, "admin"));
			if (admins.length <= 1) {
				return c.json({ error: "Cannot delete the last admin" }, 400);
			}
		}

		await db.delete(userTable).where(eq(userTable.id, userId));
		return c.json({ ok: true as const });
	});

	app.post("/admin/users/:id/name", async (c) => {
		const denied = await assertAdminAccess(c);
		if (denied) {
			return denied;
		}
		const body = await c.req.json().catch(() => null);
		const parsed = adminSetUserNameSchema.safeParse(body);
		if (!parsed.success) {
			const message = parsed.error.issues[0]?.message ?? "Display name is required";
			return c.json({ error: message }, 400);
		}
		const userId = c.req.param("id");
		const db = getAuthDb(c.env.DB);
		const [row] = await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1);
		if (!row) {
			return c.json({ error: "User not found" }, 404);
		}
		await db.update(userTable).set({ name: parsed.data.name }).where(eq(userTable.id, userId));
		const [sessions, updatedRow] = await Promise.all([
			db
				.select({
					userId: sessionTable.userId,
					updatedAt: sessionTable.updatedAt,
					expiresAt: sessionTable.expiresAt,
				})
				.from(sessionTable)
				.where(eq(sessionTable.userId, userId)),
			db
				.select()
				.from(userTable)
				.where(eq(userTable.id, userId))
				.limit(1)
				.then((r) => r[0]),
		]);
		if (!updatedRow) {
			return c.json({ error: "User not found" }, 404);
		}
		const activity = aggregateSessionActivity(sessions, Date.now()).get(userId);
		return c.json({
			user: toAdminUserRowWire({ ...updatedRow, name: parsed.data.name }, activity),
		});
	});
	return app;
}
