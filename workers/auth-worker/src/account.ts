import {
	addManualUserEmail,
	emailFromOAuthIdToken,
	getAuthDb,
	setNotificationPreferredEmail,
	setSignInEmail,
	syncUserEmailsForUser,
} from "@internal/auth-db";
import {
	accountPasswordBodySchema,
	accountPatchBodySchema,
	accountSessionsResponseSchema,
	accountSummarySchema,
	parseTimestampOrNull,
} from "@internal/auth-db/api-schemas";
import {
	account as accountTable,
	session as sessionTable,
	userEmail,
	user as userTable,
} from "@internal/auth-db/schema";
import { and, desc, eq, gt } from "drizzle-orm";
import { Hono } from "hono";
import type { AuthWorkerAppEnv } from "./app-env";
import { mapUserWithRole } from "./auth";
import { authProviderFlags } from "./auth-provider-flags";
import { jsonValidator } from "./hono-zod";
import { resolveRequestSessionId } from "./resolve-request-session-id";
import { loadAuthSession } from "./session-context";

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

export const accountPath = "/api/account" as const;

export const account = new Hono<AuthWorkerAppEnv>()
	.use("*", loadAuthSession)
	.get("/", async (c) => {
		const session = c.var.authSession;
		if (!session?.user) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		const sessionUser = session.user;

		const db = getAuthDb(c.env.DB);

		const [[userRow], accounts, emailRows] = await Promise.all([
			db.select().from(userTable).where(eq(userTable.id, sessionUser.id)).limit(1),
			db.select().from(accountTable).where(eq(accountTable.userId, sessionUser.id)),
			db.select().from(userEmail).where(eq(userEmail.userId, sessionUser.id)),
		]);
		if (!userRow) {
			return c.json({ error: "User not found" }, 404);
		}

		const hasPassword = accounts.some(
			(a) => a.providerId === "credential" && a.password != null && a.password.length > 0,
		);

		const googleLinked = accounts.some((a) => a.providerId === "google");
		const githubLinked = accounts.some((a) => a.providerId === "github");
		const emailLinked = accounts.some((a) => a.providerId === "credential");

		const googleAccount = accounts.find((a) => a.providerId === "google");
		const githubAccount = accounts.find((a) => a.providerId === "github");

		const signInEmail = userRow.email.toLowerCase();
		const profileIsAnonymous = userRow.isAnonymous === true;

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
			user: mapUserWithRole({
				id: userRow.id,
				email: userRow.email,
				name: userRow.name,
				image: userRow.image ?? null,
				role: userRow.role,
				isAnonymous: userRow.isAnonymous ?? null,
			}),
			signInMethods,
			emails,
			hasPassword,
			providers,
		});

		return c.json(summary);
	})
	.patch("/", jsonValidator(accountPatchBodySchema), async (c) => {
		const session = c.var.authSession;
		if (!session?.user) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		const body = c.req.valid("json");
		const db = getAuthDb(c.env.DB);

		if (body.intent === "setNotificationEmail") {
			const result = await setNotificationPreferredEmail(db, session.user.id, body.emailId);
			if (!result.ok) {
				return c.json({ error: result.error }, 400);
			}
			return c.json({ ok: true as const });
		}

		if (body.intent === "addContactEmail") {
			const result = await addManualUserEmail(db, session.user.id, body.email);
			if (!result.ok) {
				return c.json({ error: result.error }, 400);
			}
			return c.json({ ok: true as const, emailId: result.id });
		}

		const result = await setSignInEmail(db, session.user.id, body.emailId);
		if (!result.ok) {
			return c.json({ error: result.error }, 400);
		}
		await syncUserEmailsForUser(db, session.user.id);
		return c.json({ ok: true as const });
	})
	.get("/sessions", async (c) => {
		const session = c.var.authSession;
		if (!session?.user) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		const db = getAuthDb(c.env.DB);
		const now = new Date();
		const rows = await db
			.select({
				id: sessionTable.id,
				createdAt: sessionTable.createdAt,
				updatedAt: sessionTable.updatedAt,
				expiresAt: sessionTable.expiresAt,
				ipAddress: sessionTable.ipAddress,
				userAgent: sessionTable.userAgent,
			})
			.from(sessionTable)
			.where(and(eq(sessionTable.userId, session.user.id), gt(sessionTable.expiresAt, now)))
			.orderBy(desc(sessionTable.updatedAt));

		const currentId = await resolveRequestSessionId(c);
		const payload = accountSessionsResponseSchema.parse({
			sessions: rows.map((row) => ({
				id: row.id,
				createdAt: (parseTimestampOrNull(row.createdAt) ?? new Date(0)).toISOString(),
				updatedAt: (parseTimestampOrNull(row.updatedAt) ?? new Date(0)).toISOString(),
				expiresAt: (parseTimestampOrNull(row.expiresAt) ?? new Date(0)).toISOString(),
				ipAddress: row.ipAddress ?? null,
				userAgent: row.userAgent ?? null,
				isCurrent: currentId !== null && row.id === currentId,
			})),
		});
		return c.json(payload);
	})
	.delete("/sessions/:id", async (c) => {
		const session = c.var.authSession;
		if (!session?.user) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		const sessionId = c.req.param("id");
		const currentId = await resolveRequestSessionId(c);
		if (!currentId) {
			return c.json({ error: "Unauthorized" }, 401);
		}
		if (sessionId === currentId) {
			return c.json({ error: "Cannot revoke the current session" }, 400);
		}
		const db = getAuthDb(c.env.DB);
		const [target] = await db
			.select({ id: sessionTable.id, token: sessionTable.token })
			.from(sessionTable)
			.where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, session.user.id)))
			.limit(1);
		if (!target) {
			return c.json({ error: "Session not found" }, 404);
		}

		try {
			await c.var.auth.api.revokeSession({
				body: { token: target.token },
				headers: c.req.raw.headers,
			});
		} catch (e) {
			const message = e instanceof Error ? e.message : "Could not revoke session";
			return c.json({ error: message }, 400);
		}
		return c.json({ ok: true as const });
	})
	.post("/sessions/revoke-others", async (c) => {
		const session = c.var.authSession;
		if (!session?.user) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		const currentId = await resolveRequestSessionId(c);
		if (!currentId) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		try {
			await c.var.auth.api.revokeOtherSessions({
				headers: c.req.raw.headers,
			});
		} catch (e) {
			const message = e instanceof Error ? e.message : "Could not sign out other sessions";
			return c.json({ error: message }, 400);
		}
		return c.json({ ok: true as const });
	})
	.post("/password", jsonValidator(accountPasswordBodySchema), async (c) => {
		const session = c.var.authSession;
		if (!session?.user) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		const body = c.req.valid("json");

		if (body.intent === "setPassword") {
			try {
				await c.var.auth.api.setPassword({
					body: { newPassword: body.newPassword },
					headers: c.req.raw.headers,
				});
				return c.json({ ok: true as const });
			} catch (e) {
				const message = e instanceof Error ? e.message : "Could not set password";
				return c.json({ error: message }, 400);
			}
		}

		try {
			await c.var.auth.api.changePassword({
				body: {
					currentPassword: body.currentPassword,
					newPassword: body.newPassword,
					revokeOtherSessions: body.revokeOtherSessions === true,
				},
				headers: c.req.raw.headers,
			});
			return c.json({ ok: true as const });
		} catch (e) {
			const message = e instanceof Error ? e.message : "Could not change password";
			return c.json({ error: message }, 400);
		}
	});

export type AccountApp = typeof account;
