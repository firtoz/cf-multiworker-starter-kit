import { betterAuthPath } from "auth-worker/better-auth";
import { guestApiPath } from "auth-worker/guest-upgrade";

/** Web worker proxy prefix for Better Auth routes (`/api/auth/*`). */
export const authApiPrefix = `${betterAuthPath}/` as const;

/** Web worker proxy prefix for guest routes (`/api/guest/*`). */
export const guestApiPrefix = `${guestApiPath}/` as const;

/** Internal hostname for service-binding `AUTH.fetch` (not resolved on the public internet). */
export const AUTH_INTERNAL_ORIGIN = "https://auth.internal";

/** Anonymous guest sessions expire after this many days without a visit (Better Auth sliding `session`). */
export const GUEST_SESSION_RETENTION_DAYS = 7;
