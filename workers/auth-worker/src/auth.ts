import { parseAuthRole } from "@internal/auth-client";
import { getAuthDb } from "@internal/auth-db";
import * as authSchema from "@internal/auth-db/schema";
import { isLoopbackOAuthProxyProductionUrl } from "alchemy-utils/auth-oauth-proxy-url";
import { PRODUCT_PREFIX } from "alchemy-utils/worker-peer-scripts";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { anonymous, oAuthProxy } from "better-auth/plugins";
import { generateAnonymousGuestName } from "./guest-display-name";
import { graduateAnonymousUserFromOAuthAccount } from "./guest-graduate";
import { configureLocalGoogleOAuthProxy } from "./local-oauth-proxy-patch";

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

function bootstrapAdminEmails(raw: string): Set<string> {
	return new Set(
		raw
			.split(",")
			.map((e) => e.trim().toLowerCase())
			.filter((e) => e.length > 0),
	);
}

export function createAuth(env: AuthWorkerEnv, trustedOrigins: string[]) {
	const db = getAuthDb(env.DB);
	const bootstrap = bootstrapAdminEmails(env.AUTH_BOOTSTRAP_ADMIN_EMAILS);

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
					defaultValue: "user",
					input: false,
				},
			},
		},
		databaseHooks: {
			user: {
				create: {
					before: async (user) => {
						const email = user.email?.trim().toLowerCase();
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
							console.error("Failed to graduate guest after OAuth link", {
								userId,
								providerId: createdAccount.providerId,
								error,
							});
						}
					},
				},
			},
		},
		account: {
			accountLinking: {
				enabled: true,
				allowDifferentEmails: true,
				trustedProviders: [
					...(google ? (["google"] as const) : []),
					...(github ? (["github"] as const) : []),
				],
			},
		},
	});
}

/** Map Better Auth session user to API shape including role. */
export function mapUserWithRole(user: {
	id: string;
	email: string;
	name?: string | null;
	image?: string | null;
	role?: unknown;
	isAnonymous?: boolean | null;
}) {
	return {
		id: user.id,
		email: user.email,
		name: user.name,
		image: user.image,
		role: parseAuthRole(user.role),
		...(user.isAnonymous === true ? { isAnonymous: true as const } : {}),
	};
}
