import {
	emailFromOAuthIdToken,
	findOtherUserIdForEmail,
	getAuthDb,
	syncUserEmailsForUser,
	upsertUserEmail,
} from "@internal/auth-db";
import { authRoleSchema } from "@internal/auth-db/api-schemas";
import {
	AUTH_OAUTH_EMAIL_ALREADY_IN_USE_CODE,
	AUTH_OAUTH_EMAIL_ALREADY_IN_USE_MESSAGE,
	BETTER_AUTH_COOKIE_PREFIX,
} from "@internal/auth-db/constants";
import { parseAuthRole } from "@internal/auth-db/roles";
import type { AuthRole } from "@internal/auth-db/schema";
import * as authSchema from "@internal/auth-db/schema";
import { isLoopbackOAuthProxyProductionUrl } from "alchemy-utils/auth-oauth-proxy-url";
import { bootstrapAdminEmails } from "alchemy-utils/bootstrap-admin-emails";
import { PRODUCT_PREFIX } from "alchemy-utils/worker-peer-scripts";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { anonymous, oAuthProxy } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { ensureBootstrapAdminRole } from "./bootstrap-admin";
import { generateAnonymousGuestName } from "./guest-display-name";
import { graduateAnonymousUserFromOAuthAccount } from "./guest-graduate";
import { configureLocalGoogleOAuthProxy } from "./local-oauth-proxy-patch";
import { configurePassthroughOAuthProxy } from "./oauth-proxy-passthrough-patch";

const GUEST_SESSION_SECONDS = 60 * 60 * 24 * 7;

export type AuthWorkerEnv = {
	DB: D1Database;
	BETTER_AUTH_SECRET: string;
	AUTH_BASE_URL: string;
	AUTH_BOOTSTRAP_ADMIN_EMAILS: string;
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
	GH_CLIENT_ID: string;
	GH_CLIENT_SECRET: string;
	AUTH_SEED_ORIGINS: string;
	/** When set, Better Auth `oAuthProxy` uses this as the OAuth redirect host (loopback or staging). */
	AUTH_OAUTH_PROXY_PRODUCTION_URL?: string;
};

async function rejectEmailOwnedByOtherAccount(
	db: ReturnType<typeof getAuthDb>,
	email: string,
	excludeUserId?: string | null,
): Promise<void> {
	if (await findOtherUserIdForEmail(db, email, excludeUserId)) {
		throw APIError.from("BAD_REQUEST", {
			message: AUTH_OAUTH_EMAIL_ALREADY_IN_USE_MESSAGE,
			code: AUTH_OAUTH_EMAIL_ALREADY_IN_USE_CODE,
		});
	}
}

export function createAuth(env: AuthWorkerEnv, trustedOrigins: string[]) {
	const db = getAuthDb(env.DB);
	const bootstrap = bootstrapAdminEmails(env.AUTH_BOOTSTRAP_ADMIN_EMAILS);

	const afterOAuthLink = async (input: {
		userId: string;
		providerId: string;
		email: string;
		emailVerified: boolean;
	}) => {
		if (input.providerId === "google" || input.providerId === "github") {
			await upsertUserEmail(db, input.userId, input.email, input.providerId, input.emailVerified);
		}
		await syncUserEmailsForUser(db, input.userId);
	};

	const isEmailOwnedByOtherAccount = async (userId: string, email: string) =>
		(await findOtherUserIdForEmail(db, email, userId)) !== null;

	const oauthProxyLinkOptions = {
		afterOAuthLink,
		isEmailOwnedByOtherAccount,
	};

	const google =
		env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
			? {
					clientId: env.GOOGLE_CLIENT_ID,
					clientSecret: env.GOOGLE_CLIENT_SECRET,
				}
			: undefined;

	const github =
		env.GH_CLIENT_ID && env.GH_CLIENT_SECRET
			? {
					clientId: env.GH_CLIENT_ID,
					clientSecret: env.GH_CLIENT_SECRET,
				}
			: undefined;

	return betterAuth({
		baseURL: env.AUTH_BASE_URL,
		secret: env.BETTER_AUTH_SECRET,
		advanced: {
			cookiePrefix: BETTER_AUTH_COOKIE_PREFIX,
		},
		database: drizzleAdapter(db, {
			provider: "sqlite",
			schema: authSchema,
		}),
		trustedOrigins,
		session: {
			expiresIn: GUEST_SESSION_SECONDS,
			updateAge: 60 * 60 * 24,
		},
		emailAndPassword: {
			enabled: true,
		},
		socialProviders: {
			...(google ? { google } : {}),
			...(github ? { github } : {}),
		},
		plugins: [
			anonymous({
				emailDomainName: `${PRODUCT_PREFIX}.guest`,
				generateName: () => generateAnonymousGuestName(),
			}),
			...(env.AUTH_OAUTH_PROXY_PRODUCTION_URL?.trim()
				? [
						(() => {
							const productionURL = env.AUTH_OAUTH_PROXY_PRODUCTION_URL.trim();
							const plugin = oAuthProxy({
								productionURL,
								currentURL: env.AUTH_BASE_URL,
							});
							if (isLoopbackOAuthProxyProductionUrl(productionURL)) {
								configureLocalGoogleOAuthProxy(plugin, {
									productionURL,
									browserBaseUrl: env.AUTH_BASE_URL,
									...oauthProxyLinkOptions,
								});
							} else {
								configurePassthroughOAuthProxy(plugin, {
									productionURL,
									browserBaseUrl: env.AUTH_BASE_URL,
									...oauthProxyLinkOptions,
								});
							}
							return plugin;
						})(),
					]
				: []),
		],
		user: {
			additionalFields: {
				role: {
					type: "string",
					required: true,
					defaultValue: "user" satisfies AuthRole,
					input: false,
					validator: {
						output: authRoleSchema,
					},
				},
			},
		},
		databaseHooks: {
			user: {
				create: {
					before: async (user) => {
						const email = user.email?.trim().toLowerCase();
						const isGuest = "isAnonymous" in user && user["isAnonymous"] === true;
						if (email && !isGuest) {
							await rejectEmailOwnedByOtherAccount(db, email);
						}
						if (email && bootstrap.has(email)) {
							return {
								data: {
									...user,
									role: "admin",
								},
							};
						}
						return { data: user };
					},
				},
			},
			account: {
				create: {
					before: async (createdAccount) => {
						if (createdAccount.providerId === "credential" || !createdAccount.userId) {
							return { data: createdAccount };
						}
						const oauthEmail = emailFromOAuthIdToken(createdAccount.idToken);
						if (oauthEmail) {
							await rejectEmailOwnedByOtherAccount(db, oauthEmail, createdAccount.userId);
						}
						return { data: createdAccount };
					},
					after: async (createdAccount) => {
						if (createdAccount.providerId === "credential") {
							return;
						}
						const userId = createdAccount.userId;
						if (!userId) {
							return;
						}
						try {
							await graduateAnonymousUserFromOAuthAccount(
								db,
								userId,
								createdAccount.providerId,
								createdAccount.idToken,
							);
						} catch (error) {
							if (createdAccount.id) {
								await db
									.delete(authSchema.account)
									.where(eq(authSchema.account.id, createdAccount.id));
							}
							const message = error instanceof Error ? error.message : String(error);
							if (message.toLowerCase().includes("already registered")) {
								throw APIError.from("BAD_REQUEST", {
									message: AUTH_OAUTH_EMAIL_ALREADY_IN_USE_MESSAGE,
									code: AUTH_OAUTH_EMAIL_ALREADY_IN_USE_CODE,
								});
							}
							throw error;
						}
						try {
							await syncUserEmailsForUser(db, userId);
						} catch (error) {
							console.error("Failed to sync provider emails after OAuth link", {
								userId,
								providerId: createdAccount.providerId,
								error,
							});
						}
						await ensureBootstrapAdminRole(db, userId, bootstrap);
					},
				},
			},
		},
		account: {
			accountLinking: {
				enabled: true,
				// Cold `/sign-in/social` must not merge into an existing account by email alone.
				// Linking is explicit via `/link-social` (Account or guest upgrade while signed in).
				disableImplicitLinking: true,
				allowDifferentEmails: true,
				trustedProviders: [
					...(google ? (["google"] as const) : []),
					...(github ? (["github"] as const) : []),
				],
			},
		},
	});
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;
/** Better Auth infers `role` as `string`; align with Drizzle `AuthRole`. */
export type AuthSessionUser = Omit<AuthSession["user"], "role"> & { role: AuthRole };

/** Session user or D1 row — session `role` is `string` until parsed. */
export type UserWithRoleInput = {
	id: string;
	email: string;
	name?: string | null;
	image?: string | null | undefined;
	role: AuthRole | string;
	isAnonymous?: boolean | null | undefined;
};

export function mapUserWithRole(user: UserWithRoleInput) {
	return {
		id: user.id,
		email: user.email,
		name: user.name,
		image: user.image,
		role: parseAuthRole(user.role),
		...(user.isAnonymous === true ? { isAnonymous: true as const } : {}),
	};
}
