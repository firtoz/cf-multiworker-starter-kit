/** Max length for `user.name` (profile display name). */
export const PROFILE_NAME_MAX_CHARS = 64;

/**
 * Better Auth OAuth redirect error for email owned by another account.
 * Callback converts message spaces to underscores → `email_already_in_use`.
 */
export const AUTH_OAUTH_EMAIL_ALREADY_IN_USE_MESSAGE = "email already in use";
export const AUTH_OAUTH_EMAIL_ALREADY_IN_USE_CODE = "email_already_in_use";
