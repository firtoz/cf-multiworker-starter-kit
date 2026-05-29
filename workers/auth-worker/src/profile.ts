import { getAuthDb, user as userTable } from "@internal/auth-db";
import { profileUpdateResponseSchema, profileUpdateSchema } from "@internal/auth-db/api-schemas";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AuthWorkerAppEnv } from "./app-env";
import { mapUserWithRole } from "./auth";
import { jsonValidator } from "./hono-zod";

export const profilePath = "/api/profile" as const;

export const profile = new Hono<AuthWorkerAppEnv>().patch(
	"/",
	jsonValidator(profileUpdateSchema),
	async (c) => {
		const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
		if (!session?.user) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		const patch = c.req.valid("json");
		const db = getAuthDb(c.env.DB);
		await db.update(userTable).set(patch).where(eq(userTable.id, session.user.id));

		const [row] = await db
			.select()
			.from(userTable)
			.where(eq(userTable.id, session.user.id))
			.limit(1);
		if (!row) {
			return c.json({ error: "User not found" }, 404);
		}

		const response = profileUpdateResponseSchema.parse({
			user: mapUserWithRole(row),
		});

		return c.json(response);
	},
);

export type ProfileApp = typeof profile;
