/** Better Auth appends this query param on failed OAuth redirects (see `redirectOnError` in better-auth). */
export const BETTER_AUTH_OAUTH_ERROR_QUERY = "error";

/** Better Auth OAuth redirect error codes we show on `/account` after Connect provider. */
export const BETTER_AUTH_LINK_ERROR_CODES = {
	accountAlreadyLinked: "account_already_linked_to_different_user",
	emailMismatch: "email_doesn't_match",
	unableToLink: "unable_to_link_account",
	invalidCode: "invalid_code",
	noCode: "no_code",
	providerNotFound: "oauth_provider_not_found",
	emailNotFound: "email_not_found",
	invalidPayload: "invalid_payload",
	payloadExpired: "payload_expired",
	userCreationFailed: "user_creation_failed",
} as const;

const LINK_ERROR_MESSAGES: Record<string, string> = {
	[BETTER_AUTH_LINK_ERROR_CODES.accountAlreadyLinked]:
		"That sign-in provider is already connected to another account. Sign in with it directly, or remove it from the other account first.",
	[BETTER_AUTH_LINK_ERROR_CODES.emailMismatch]:
		"That provider’s email does not match this account. This app allows different emails per provider — try a different Google/GitHub account.",
	[BETTER_AUTH_LINK_ERROR_CODES.unableToLink]:
		"Could not connect that provider. Try again or use a different account.",
	[BETTER_AUTH_LINK_ERROR_CODES.invalidCode]:
		"Sign-in with that provider expired or was interrupted. Try connecting again.",
	[BETTER_AUTH_LINK_ERROR_CODES.noCode]:
		"Sign-in with that provider was cancelled or incomplete. Try again.",
	[BETTER_AUTH_LINK_ERROR_CODES.providerNotFound]: "That provider is not configured on this app.",
	[BETTER_AUTH_LINK_ERROR_CODES.emailNotFound]:
		"That provider did not return an email address. Try another account.",
	[BETTER_AUTH_LINK_ERROR_CODES.invalidPayload]:
		"OAuth link data was invalid. Try connecting again from this preview.",
	[BETTER_AUTH_LINK_ERROR_CODES.payloadExpired]:
		"OAuth link took too long — start Connect again from this page.",
	[BETTER_AUTH_LINK_ERROR_CODES.userCreationFailed]:
		"Could not finish sign-in after OAuth. Try again or use email instead.",
};

/** Map Better Auth `?error=` codes to copy for the account page. */
export function messageForAccountLinkError(code: string | null | undefined): string | undefined {
	if (!code?.trim()) {
		return undefined;
	}
	const key = code.trim();
	return LINK_ERROR_MESSAGES[key] ?? "Could not connect that sign-in method. Try again.";
}

/** Read Better Auth link errors from the account URL (`?error=…` from `errorCallbackURL`). */
export function accountLinkErrorFromRequestUrl(requestUrl: string): string | undefined {
	const code = new URL(requestUrl).searchParams.get(BETTER_AUTH_OAUTH_ERROR_QUERY);
	return messageForAccountLinkError(code);
}
