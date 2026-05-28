import {
	addManualUserEmail,
	emailFromOAuthIdToken,
	getAuthDb,
	setNotificationPreferredEmail,
	setSignInEmail,
	syncUserEmailsForUser,
} from "@internal/auth-db";
import {
	accountSummarySchema,
	addContactEmailSchema,
	changePasswordSchema,
	setNotificationEmailSchema,
	setPasswordSchema,
	setSignInEmailSchema,
} from "@internal/auth-db/api-schemas";
import { account as accountTable, userEmail } from "@internal/auth-db/schema";
import { eq } from "drizzle-orm";
import type { CloudflareEnv } from "../env";
import type { createAuth } from "./auth";
import { mapUserWithRole } from "./auth";

type AuthInstance = ReturnType<typeof createAuth>;

type AppVariables = {
	auth: AuthInstance;
	trustedOrigins: string[];
};

type EmailRow = { email: string; source: string };

function oauthProviderEmail(
	providerId: "google" | "github",
	account: { idToken: string | null } | undefined,
	emailRows: EmailRow[],
): string | null {
	const fromToken = account ? emailFromOAuthIdToken(account.idToken) : null;
	if (fromToken) {
		return fromToken;
	}
	return emailRows.find((r) => r.source === providerId)?.email ?? null;
}

export function registerAccountRoutes(
	app: import("hono").Hono<{ Bindings: CloudflareEnv; Variables: AppVariables }>,
) {
	app.get("/api/account", async (c) => {
		const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
		if (!session?.user) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		const db = getAuthDb(c.env.DB);
		await syncUserEmailsForUser(db, session.user.id);

		const accounts = await db
			.select()
			.from(accountTable)
			.where(eq(accountTable.userId, session.user.id));

		const hasPassword = accounts.some(
			(a) => a.providerId === "credential" && a.password != null && a.password.length > 0,
		);

		const googleLinked = accounts.some((a) => a.providerId === "google");
		const githubLinked = accounts.some((a) => a.providerId === "github");
		const emailLinked = accounts.some((a) => a.providerId === "credential");

		const googleAccount = accounts.find((a) => a.providerId === "google");
		const githubAccount = accounts.find((a) => a.providerId === "github");

		const signInEmail = session.user.email.toLowerCase();

		const emailRows = await db
			.select()
			.from(userEmail)
			.where(eq(userEmail.userId, session.user.id));

		const emailRowsForLookup = emailRows.map((r) => ({ email: r.email, source: r.source }));

		const env = c.env;
		const summary = accountSummarySchema.parse({
			user: mapUserWithRole({
				id: session.user.id,
				email: session.user.email,
				name: session.user.name,
				image: session.user.image,
				role: (session.user as { role?: unknown }).role,
				isAnonymous: (session.user as { isAnonymous?: boolean | null }).isAnonymous,
			}),
			signInMethods: [
				{
					provider: "email" as const,
					linked: emailLinked,
					email: emailLinked ? signInEmail : null,
				},
				{
					provider: "google" as const,
					linked: googleLinked,
					accountId: googleAccount?.accountId,
					email: googleLinked
						? oauthProviderEmail("google", googleAccount, emailRowsForLookup)
						: null,
				},
				{
					provider: "github" as const,
					linked: githubLinked,
					accountId: githubAccount?.accountId,
					email: githubLinked
						? oauthProviderEmail("github", githubAccount, emailRowsForLookup)
						: null,
				},
			],
			emails: emailRows.map((row) => ({
				id: row.id,
				email: row.email,
				source: row.source,
				verified: row.verified,
				isNotificationPreferred: row.isNotificationPreferred,
				isSignInEmail: row.email.toLowerCase() === signInEmail,
			})),
			hasPassword,
			providers: {
				google: Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim()),
				github: Boolean(env.GITHUB_CLIENT_ID?.trim() && env.GITHUB_CLIENT_SECRET?.trim()),
				email: true,
			},
		});

		return c.json(summary);
	});

	app.patch("/api/account", async (c) => {
		const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
		if (!session?.user) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		const body = await c.req.json().catch(() => null);
		const intent =
			body != null && typeof body === "object" && "intent" in body
				? String((body as { intent: unknown }).intent)
				: "";

		const db = getAuthDb(c.env.DB);

		if (intent === "setNotificationEmail") {
			const parsed = setNotificationEmailSchema.safeParse(body);
			if (!parsed.success) {
				return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);
			}
			const result = await setNotificationPreferredEmail(db, session.user.id, parsed.data.emailId);
			if (!result.ok) {
				return c.json({ error: result.error }, 400);
			}
			return c.json({ ok: true });
		}

		if (intent === "addContactEmail") {
			const parsed = addContactEmailSchema.safeParse(body);
			if (!parsed.success) {
				return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);
			}
			const result = await addManualUserEmail(db, session.user.id, parsed.data.email);
			if (!result.ok) {
				return c.json({ error: result.error }, 400);
			}
			return c.json({ ok: true, emailId: result.id });
		}

		if (intent === "setSignInEmail") {
			const parsed = setSignInEmailSchema.safeParse(body);
			if (!parsed.success) {
				return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);
			}
			const result = await setSignInEmail(db, session.user.id, parsed.data.emailId);
			if (!result.ok) {
				return c.json({ error: result.error }, 400);
			}
			return c.json({ ok: true });
		}

		return c.json({ error: "Unknown action" }, 400);
	});

	app.post("/api/account/password", async (c) => {
		const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
		if (!session?.user) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		const body = await c.req.json().catch(() => null);
		const intent =
			body != null && typeof body === "object" && "intent" in body
				? String((body as { intent: unknown }).intent)
				: "";

		if (intent === "setPassword") {
			const parsed = setPasswordSchema.safeParse(body);
			if (!parsed.success) {
				return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);
			}
			try {
				await c.var.auth.api.setPassword({
					body: { newPassword: parsed.data.newPassword },
					headers: c.req.raw.headers,
				});
				return c.json({ ok: true });
			} catch (e) {
				const message = e instanceof Error ? e.message : "Could not set password";
				return c.json({ error: message }, 400);
			}
		}

		if (intent === "changePassword") {
			const parsed = changePasswordSchema.safeParse(body);
			if (!parsed.success) {
				return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);
			}
			try {
				await c.var.auth.api.changePassword({
					body: {
						currentPassword: parsed.data.currentPassword,
						newPassword: parsed.data.newPassword,
						revokeOtherSessions: false,
					},
					headers: c.req.raw.headers,
				});
				return c.json({ ok: true });
			} catch (e) {
				const message = e instanceof Error ? e.message : "Could not change password";
				return c.json({ error: message }, 400);
			}
		}

		return c.json({ error: "Unknown action" }, 400);
	});

	return app;
}
