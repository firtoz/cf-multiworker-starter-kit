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
import { AUTH_ADMIN_SECRET_HEADER } from "@internal/auth-db/constants";
import { parseAuthRole } from "@internal/auth-db/roles";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { AuthWorkerAppEnv } from "./app-env";
import { jsonValidator } from "./hono-zod";
import {
	appendTrustedOrigin,
	getTrustedOrigins,
	removeTrustedOrigin,
	setTrustedOrigins,
} from "./origins";

export const adminPath = "/admin" as const;

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

export async function assertAdminAccess(c: {
	env: AuthWorkerAppEnv["Bindings"];
	var: AuthWorkerAppEnv["Variables"];
	req: { header: (name: string) => string | undefined; raw: Request };
	json: (body: unknown, status?: number) => Response;
}): Promise<Response | null> {
	const secretHeader = c.req.header(AUTH_ADMIN_SECRET_HEADER);
	if (secretHeader && secretHeader === c.env.AUTH_ADMIN_SECRET) {
		return null;
	}
	const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
	const role = session?.user ? parseAuthRole(session.user.role) : "user";
	if (!session?.user || role !== "admin") {
		return c.json({ error: "Forbidden" }, 403);
	}
	return null;
}

const requireAdmin = createMiddleware<AuthWorkerAppEnv>(async (c, next) => {
	const denied = await assertAdminAccess(c);
	if (denied) {
		return denied;
	}
	await next();
});

export const admin = new Hono<AuthWorkerAppEnv>()
	.use("*", requireAdmin)
	.get("/origins", async (c) => {
		const origins = await getTrustedOrigins(c.env.AUTH_KV);
		return c.json({ origins });
	})
	.post("/origins", jsonValidator(adminSetOriginsSchema), async (c) => {
		const { origins } = c.req.valid("json");
		await setTrustedOrigins(c.env.AUTH_KV, origins);
		return c.json({ origins });
	})
	.post("/origins/add", jsonValidator(adminAddOriginSchema), async (c) => {
		const { origin } = c.req.valid("json");
		const origins = await appendTrustedOrigin(c.env.AUTH_KV, origin);
		return c.json({ origins });
	})
	.delete("/origins/:origin", async (c) => {
		const origin = decodeURIComponent(c.req.param("origin"));
		const origins = await removeTrustedOrigin(c.env.AUTH_KV, origin);
		return c.json({ origins });
	})
	.get("/users", async (c) => {
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
	})
	.post("/users/:id/role", jsonValidator(adminSetRoleSchema), async (c) => {
		const { role } = c.req.valid("json");
		const db = getAuthDb(c.env.DB);
		const userId = c.req.param("id");

		if (role === "user") {
			const admins = await db.select().from(userTable).where(eq(userTable.role, "admin"));
			const target = admins.find((a) => a.id === userId);
			if (target && admins.length <= 1) {
				return c.json({ error: "Cannot demote the last admin" }, 400);
			}
		}

		await db.update(userTable).set({ role }).where(eq(userTable.id, userId));
		return c.json({ ok: true as const });
	})
	.delete("/users/:id", async (c) => {
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
	})
	.post("/users/:id/name", jsonValidator(adminSetUserNameSchema), async (c) => {
		const { name } = c.req.valid("json");
		const userId = c.req.param("id");
		const db = getAuthDb(c.env.DB);
		const [row] = await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1);
		if (!row) {
			return c.json({ error: "User not found" }, 404);
		}
		await db.update(userTable).set({ name }).where(eq(userTable.id, userId));
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
			user: toAdminUserRowWire({ ...updatedRow, name }, activity),
		});
	});

export type AdminApp = typeof admin;
