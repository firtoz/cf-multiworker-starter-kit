import { PRODUCT_PREFIX } from "alchemy-utils/worker-peer-scripts";

/** Max length for `user.name` (profile display name). */
export const PROFILE_NAME_MAX_CHARS = 64;

/** Machine-to-machine admin API header (origins CRUD without browser session). */
export const AUTH_ADMIN_SECRET_HEADER = `x-${PRODUCT_PREFIX}-auth-admin-secret`;

/** Hostname used for auth-worker `AUTH.fetch` service-binding requests (not a public DNS name). */
export const AUTH_SERVICE_BINDING_HOST = "auth.internal" as const;

/** Better Auth `advanced.cookiePrefix` — keep in sync with auth-worker `createAuth()`. */
export const BETTER_AUTH_COOKIE_PREFIX = "better-auth";

/**
 * Better Auth OAuth redirect error for email owned by another account.
 * Callback converts message spaces to underscores → `email_already_in_use`.
 */
export const AUTH_OAUTH_EMAIL_ALREADY_IN_USE_MESSAGE = "email already in use";
export const AUTH_OAUTH_EMAIL_ALREADY_IN_USE_CODE = "email_already_in_use";
