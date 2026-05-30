import type { MaybeError } from "@firtoz/maybe-error";
import { browserClient } from "@internal/auth-client";
import type {
	AuthSocialProvider,
	BetterAuthSessionOkResponse,
} from "@internal/auth-db/api-schemas";
import { setLastLoginMethod, setPendingLoginMethod } from "~/lib/last-login-method";

function redirectIfOAuthStart(
	result: MaybeError<BetterAuthSessionOkResponse>,
): MaybeError<BetterAuthSessionOkResponse> {
	if (result.success && result.result.url) {
		window.location.assign(result.result.url);
	}
	return result;
}

export async function signInWithEmail(
	email: string,
	password: string,
	callbackURL: string,
): Promise<MaybeError<BetterAuthSessionOkResponse>> {
	const result = await browserClient.auth.signInEmail(email, password, callbackURL);
	if (result.success) {
		setLastLoginMethod("email");
		window.location.assign(callbackURL);
	}
	return result;
}

export async function signInWithSocial(
	provider: AuthSocialProvider,
	callbackURL: string,
	errorCallbackURL?: string,
): Promise<MaybeError<BetterAuthSessionOkResponse>> {
	const result = redirectIfOAuthStart(
		await browserClient.auth.signInSocial(provider, callbackURL, errorCallbackURL),
	);
	if (result.success) {
		setPendingLoginMethod(provider);
	}
	return result;
}

export async function linkSocialProvider(
	provider: AuthSocialProvider,
	callbackURL: string,
	errorCallbackURL?: string,
): Promise<MaybeError<BetterAuthSessionOkResponse>> {
	return redirectIfOAuthStart(
		await browserClient.auth.linkSocial(provider, callbackURL, errorCallbackURL),
	);
}

export async function signUpWithEmail(
	name: string,
	email: string,
	password: string,
	callbackURL: string,
): Promise<MaybeError<BetterAuthSessionOkResponse>> {
	const result = await browserClient.auth.signUpEmail(name, email, password, callbackURL);
	if (result.success) {
		setLastLoginMethod("email");
		window.location.assign(callbackURL);
	}
	return result;
}
