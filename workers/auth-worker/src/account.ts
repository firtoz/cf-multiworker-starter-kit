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
import { authProviderFlags } from "./auth-provider-flags";

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
	linked: boolean,
	profileEmail: string,
	profileIsAnonymous: boolean,
): string | null {
	const fromToken = account ? emailFromOAuthIdToken(account.idToken) : null;
	if (fromToken) {
		return fromToken;
	}
	const fromSource = emailRows.find((r) => r.source === providerId)?.email ?? null;
	if (fromSource) {
		return fromSource;
	}
	if (linked && !profileIsAnonymous && profileEmail.includes("@")) {
		return profileEmail;
	}
	return null;
}

export function registerAccountRoutes(
	app: import("hono").Hono<{ Bindings: CloudflareEnv; Variables: AppVariables }>,
) {
	app.get("/api/account", async (c) => {
		const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
		if (!session?.user) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		const sessionUser = session.user;

		const db = getAuthDb(c.env.DB);
		await syncUserEmailsForUser(db, sessionUser.id);

		const accounts = await db
			.select()
			.from(accountTable)
			.where(eq(accountTable.userId, sessionUser.id));

		const hasPassword = accounts.some(
			(a) => a.providerId === "credential" && a.password != null && a.password.length > 0,
		);

		const googleLinked = accounts.some((a) => a.providerId === "google");
		const githubLinked = accounts.some((a) => a.providerId === "github");
		const emailLinked = accounts.some((a) => a.providerId === "credential");

		const googleAccount = accounts.find((a) => a.providerId === "google");
		const githubAccount = accounts.find((a) => a.providerId === "github");

		const signInEmail = sessionUser.email.toLowerCase();
		const profileIsAnonymous = sessionUser.isAnonymous === true;

		const emailRows = await db.select().from(userEmail).where(eq(userEmail.userId, sessionUser.id));

		const emailRowsForLookup = emailRows.map((r) => ({ email: r.email, source: r.source }));

		const env = c.env;
		const providers = authProviderFlags(env);

		const signInMethods = [
			{
				provider: "email" as const,
				linked: emailLinked,
				email: emailLinked ? signInEmail : null,
			},
			...(providers.google
				? [
						{
							provider: "google" as const,
							linked: googleLinked,
							accountId: googleAccount?.accountId,
							email: googleLinked
								? oauthProviderEmail(
										"google",
										googleAccount,
										emailRowsForLookup,
										googleLinked,
										signInEmail,
										profileIsAnonymous,
									)
								: null,
						},
					]
				: []),
			...(providers.github
				? [
						{
							provider: "github" as const,
							linked: githubLinked,
							accountId: githubAccount?.accountId,
							email: githubLinked
								? oauthProviderEmail(
										"github",
										githubAccount,
										emailRowsForLookup,
										githubLinked,
										signInEmail,
										profileIsAnonymous,
									)
								: null,
						},
					]
				: []),
		];

		const emails = emailRows
			.filter((row) => {
				if (row.source === "google" && !providers.google) {
					return false;
				}
				if (row.source === "github" && !providers.github) {
					return false;
				}
				return true;
			})
			.map((row) => ({
				id: row.id,
				email: row.email,
				source: row.source,
				verified: row.verified,
				isNotificationPreferred: row.isNotificationPreferred,
				isSignInEmail: row.email.toLowerCase() === signInEmail,
			}));

		const summary = accountSummarySchema.parse({
			user: mapUserWithRole(sessionUser),
			signInMethods,
			emails,
			hasPassword,
			providers,
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
