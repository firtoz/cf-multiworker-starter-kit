import type { MaybeError } from "@firtoz/maybe-error";
import { browserClient } from "@internal/auth-client";
import type { GuestUpgradeEmailResponse } from "@internal/auth-db/api-schemas";
import { setLastLoginMethod } from "~/lib/last-login-method";

/** Upgrade the current guest session to email/password without changing user id. */
export async function upgradeGuestWithEmail(
	email: string,
	password: string,
	callbackURL: string,
): Promise<MaybeError<GuestUpgradeEmailResponse>> {
	const result = await browserClient.guestUpgrade.upgradeEmail(email, password);
	if (result.success) {
		setLastLoginMethod("email");
		window.location.assign(callbackURL);
	}
	return result;
}
