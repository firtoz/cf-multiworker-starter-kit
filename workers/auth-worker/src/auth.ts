import { parseAuthRole } from "@internal/auth-client";
import { getAuthDb } from "@internal/auth-db";
import * as authSchema from "@internal/auth-db/schema";
import { PRODUCT_PREFIX } from "alchemy-utils/worker-peer-scripts";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { anonymous } from "better-auth/plugins";
import { generateAnonymousGuestName } from "./guest-display-name";

const GUEST_SESSION_SECONDS = 60 * 60 * 24 * 7;

export type AuthWorkerEnv = {
	DB: D1Database;
	BETTER_AUTH_SECRET: string;
	AUTH_BASE_URL: string;
	AUTH_BOOTSTRAP_ADMIN_EMAILS: string;
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
	GITHUB_CLIENT_ID: string;
	GITHUB_CLIENT_SECRET: string;
	AUTH_SEED_ORIGINS: string;
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
		env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
			? {
					clientId: env.GITHUB_CLIENT_ID,
					clientSecret: env.GITHUB_CLIENT_SECRET,
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
				onLinkAccount: async () => {
					// Chat history lives in per-room DO SQLite; linking keeps the new account only.
				},
			}),
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
		},
		account: {
			accountLinking: {
				enabled: true,
				trustedProviders: [],
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
