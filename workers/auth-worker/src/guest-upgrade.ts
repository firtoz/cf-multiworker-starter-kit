import { getAuthDb, syncUserEmailsForUser } from "@internal/auth-db";
import { guestUpgradeEmailSchema } from "@internal/auth-db/api-schemas";
import type { CloudflareEnv } from "../env";
import type { createAuth } from "./auth";
import { mapUserWithRole } from "./auth";
import { graduateAnonymousUser } from "./guest-graduate";

type AuthInstance = ReturnType<typeof createAuth>;

type AppVariables = {
	auth: AuthInstance;
	trustedOrigins: string[];
};

export function registerGuestUpgradeRoutes(
	app: import("hono").Hono<{ Bindings: CloudflareEnv; Variables: AppVariables }>,
) {
	app.post("/api/guest/upgrade/email", async (c) => {
		const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
		if (!session?.user) {
			return c.json({ error: "Sign in as a guest first (open chat to get a guest session)" }, 401);
		}
		if (session.user.isAnonymous !== true) {
			return c.json({ error: "You already have a full account" }, 400);
		}

		const body = await c.req.json().catch(() => null);
		const parsed = guestUpgradeEmailSchema.safeParse(body);
		if (!parsed.success) {
			return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);
		}

		const db = getAuthDb(c.env.DB);
		const graduate = await graduateAnonymousUser(db, session.user.id, {
			email: parsed.data.email,
			emailVerified: false,
		});
		if (!graduate.ok) {
			return c.json({ error: graduate.error }, 400);
		}

		try {
			await c.var.auth.api.setPassword({
				body: { newPassword: parsed.data.password },
				headers: c.req.raw.headers,
			});
		} catch (e) {
			const message = e instanceof Error ? e.message : "Could not set password";
			return c.json({ error: message }, 400);
		}

		await syncUserEmailsForUser(db, session.user.id);

		const refreshed = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
		if (!refreshed?.user) {
			return c.json({ error: "Account created but session could not be refreshed" }, 500);
		}

		return c.json({
			user: mapUserWithRole({
				id: refreshed.user.id,
				email: refreshed.user.email,
				name: refreshed.user.name,
				image: refreshed.user.image,
				role: (refreshed.user as { role?: unknown }).role,
				isAnonymous: (refreshed.user as { isAnonymous?: boolean | null }).isAnonymous,
			}),
		});
	});

	return app;
}
