import { getAuthDb, user as userTable } from "@internal/auth-db";
import { profileUpdateResponseSchema, profileUpdateSchema } from "@internal/auth-db/api-schemas";
import { eq } from "drizzle-orm";
import type { CloudflareEnv } from "../env";
import type { createAuth } from "./auth";
import { mapUserWithRole } from "./auth";

type AuthInstance = ReturnType<typeof createAuth>;

type AppVariables = {
	auth: AuthInstance;
	trustedOrigins: string[];
};

export function registerProfileRoutes(
	app: import("hono").Hono<{ Bindings: CloudflareEnv; Variables: AppVariables }>,
) {
	/** Session-authenticated sparse profile patch (self-service columns on `user`). */
	app.patch("/api/profile", async (c) => {
		const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
		if (!session?.user) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		const body = await c.req.json().catch(() => null);
		const parsed = profileUpdateSchema.safeParse(body);
		if (!parsed.success) {
			const message = parsed.error.issues[0]?.message ?? "Invalid profile update";
			return c.json({ error: message }, 400);
		}

		const db = getAuthDb(c.env.DB);
		await db.update(userTable).set(parsed.data).where(eq(userTable.id, session.user.id));

		const [row] = await db
			.select()
			.from(userTable)
			.where(eq(userTable.id, session.user.id))
			.limit(1);
		if (!row) {
			return c.json({ error: "User not found" }, 404);
		}

		const response = profileUpdateResponseSchema.parse({
			user: mapUserWithRole({
				id: row.id,
				email: row.email,
				name: row.name,
				image: row.image,
				role: row.role,
				isAnonymous: row.isAnonymous,
			}),
		});

		return c.json(response);
	});
	return app;
}
