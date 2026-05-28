import { AUTH_ADMIN_SECRET_HEADER, parseAuthRole } from "@internal/auth-client";
import { getAuthDb, user as userTable } from "@internal/auth-db";
import {
	adminAddOriginSchema,
	adminSetOriginsSchema,
	adminSetRoleSchema,
	adminSetUserNameSchema,
	adminUserRowSchema,
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
		const rows = await db.select().from(userTable);
		return c.json({
			users: rows.map((r) =>
				adminUserRowSchema.parse({
					id: r.id,
					email: r.email,
					name: r.name,
					role: r.role,
					createdAt: r.createdAt,
				}),
			),
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
		return c.json({
			user: adminUserRowSchema.parse({
				id: row.id,
				email: row.email,
				name: parsed.data.name,
				role: row.role,
				createdAt: row.createdAt,
			}),
		});
	});
}
