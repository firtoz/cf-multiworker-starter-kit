import { getAuthDb, syncUserEmailsForUser } from "@internal/auth-db";
import { guestUpgradeEmailSchema } from "@internal/auth-db/api-schemas";
import { user as userTable } from "@internal/auth-db/schema";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AuthWorkerAppEnv } from "./app-env";
import { mapUserWithRole } from "./auth";
import {
	type GuestGraduationSnapshot,
	graduateAnonymousUser,
	revertAnonymousUserGraduation,
} from "./guest-graduate";
import { jsonValidator } from "./hono-zod";
import { loadAuthSession } from "./session-context";

export const guestApiPath = "/api/guest" as const;
export const guestUpgradePath = `${guestApiPath}/upgrade` as const;

export const guestUpgrade = new Hono<AuthWorkerAppEnv>()
	.use("*", loadAuthSession)
	.post("/email", jsonValidator(guestUpgradeEmailSchema), async (c) => {
		const session = c.var.authSession;
		if (!session?.user) {
			return c.json({ error: "Sign in as a guest first (open chat to get a guest session)" }, 401);
		}
		if (session.user.isAnonymous !== true) {
			return c.json({ error: "You already have a full account" }, 400);
		}

		const { email, password } = c.req.valid("json");
		const db = getAuthDb(c.env.DB);

		const [guestRow] = await db
			.select()
			.from(userTable)
			.where(eq(userTable.id, session.user.id))
			.limit(1);
		if (guestRow?.isAnonymous !== true) {
			return c.json({ error: "You already have a full account" }, 400);
		}

		const snapshot: GuestGraduationSnapshot = {
			email: guestRow.email,
			emailVerified: guestRow.emailVerified,
			name: guestRow.name,
			image: guestRow.image ?? null,
		};

		const graduate = await graduateAnonymousUser(db, session.user.id, {
			email,
			emailVerified: false,
		});
		if (!graduate.ok) {
			return c.json({ error: graduate.error }, 400);
		}

		try {
			await c.var.auth.api.setPassword({
				body: { newPassword: password },
				headers: c.req.raw.headers,
			});
		} catch (e) {
			await revertAnonymousUserGraduation(db, session.user.id, snapshot);
			const message = e instanceof Error ? e.message : "Could not set password";
			return c.json({ error: message }, 400);
		}

		await syncUserEmailsForUser(db, session.user.id);

		const refreshed = await c.var.auth.api.getSession({
			headers: c.req.raw.headers,
			query: { disableCookieCache: true },
		});
		if (!refreshed?.user) {
			return c.json({ error: "Account created but session could not be refreshed" }, 500);
		}

		return c.json({
			user: mapUserWithRole(refreshed.user),
		});
	});

export type GuestUpgradeApp = typeof guestUpgrade;
