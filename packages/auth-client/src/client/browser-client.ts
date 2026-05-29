import type { MaybeError } from "@firtoz/maybe-error";
import {
	type AuthSocialProvider,
	type BetterAuthSessionOkResponse,
	betterAuthSessionOkResponseSchema,
	type GuestUpgradeEmailResponse,
	guestUpgradeEmailResponseSchema,
} from "@internal/auth-db/api-schemas";
import { browserAuthWorkerHono } from "../binding/auth-worker-hono-client";
import { parseBetterAuthJson, parseBindingJson } from "./parse-json";

const betterAuth = browserAuthWorkerHono.betterAuth;
const guestUpgrade = browserAuthWorkerHono.guestUpgrade;

/** Poll until HttpOnly auth cookies from a loader are visible in the browser. */
export async function waitForBrowserSession(maxAttempts = 40): Promise<boolean> {
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		try {
			const res = await betterAuth.get({ url: "/get-session" });
			if (res.ok) {
				const body = await res.json();
				if (body && typeof body === "object" && "user" in body && "session" in body) {
					return true;
				}
			}
		} catch {
			// retry
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	return false;
}

/** Same-origin auth-worker client for browser UI (cookies included). */
export const browserClient = {
	hono: browserAuthWorkerHono,

	auth: {
		signInEmail(
			email: string,
			password: string,
			callbackURL: string,
		): Promise<MaybeError<BetterAuthSessionOkResponse>> {
			return parseBetterAuthJson(
				betterAuth.post({
					url: "/sign-in/email",
					body: { email, password, callbackURL, rememberMe: true },
				}),
				"Sign-in failed",
				betterAuthSessionOkResponseSchema,
			);
		},
		signUpEmail(
			name: string,
			email: string,
			password: string,
			callbackURL: string,
		): Promise<MaybeError<BetterAuthSessionOkResponse>> {
			return parseBetterAuthJson(
				betterAuth.post({
					url: "/sign-up/email",
					body: { name, email, password, callbackURL, rememberMe: true },
				}),
				"Sign-up failed",
				betterAuthSessionOkResponseSchema,
			);
		},
		signInSocial(
			provider: AuthSocialProvider,
			callbackURL: string,
			errorCallbackURL?: string,
		): Promise<MaybeError<BetterAuthSessionOkResponse>> {
			return parseBetterAuthJson(
				betterAuth.post({
					url: "/sign-in/social",
					body: {
						provider,
						callbackURL,
						...(errorCallbackURL ? { errorCallbackURL } : {}),
					},
				}),
				"Sign-in failed",
				betterAuthSessionOkResponseSchema,
			);
		},
		linkSocial(
			provider: AuthSocialProvider,
			callbackURL: string,
			errorCallbackURL?: string,
		): Promise<MaybeError<BetterAuthSessionOkResponse>> {
			return parseBetterAuthJson(
				betterAuth.post({
					url: "/link-social",
					body: {
						provider,
						callbackURL,
						errorCallbackURL: errorCallbackURL ?? callbackURL,
					},
				}),
				"Could not connect that provider",
				betterAuthSessionOkResponseSchema,
			);
		},
	},

	guestUpgrade: {
		upgradeEmail(email: string, password: string): Promise<MaybeError<GuestUpgradeEmailResponse>> {
			return parseBindingJson(
				guestUpgrade.post({
					url: "/email",
					body: { email: email.trim(), password },
				}),
				"Could not create account",
				guestUpgradeEmailResponseSchema,
			);
		},
	},
};

export type BrowserClient = typeof browserClient;
