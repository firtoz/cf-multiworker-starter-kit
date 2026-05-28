import { fail, type MaybeError, success } from "@firtoz/maybe-error";
import { type AuthApiErrorBody, GUEST_UPGRADE_EMAIL_PATH } from "@internal/auth-client";
import { setLastLoginMethod } from "~/lib/last-login-method";

type GuestUpgradeEmailBody = {
	email: string;
	password: string;
};

/** Upgrade the current guest session to email/password without changing user id. */
export async function upgradeGuestWithEmail(
	email: string,
	password: string,
	callbackURL: string,
): Promise<MaybeError> {
	const body: GuestUpgradeEmailBody = {
		email: email.trim(),
		password,
	};
	const res = await fetch(GUEST_UPGRADE_EMAIL_PATH, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "include",
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		const errorBody = await res.json<AuthApiErrorBody>().catch((): AuthApiErrorBody | null => null);
		return fail(errorBody?.error ?? "Could not create account");
	}
	setLastLoginMethod("email");
	window.location.assign(callbackURL);
	return success();
}
