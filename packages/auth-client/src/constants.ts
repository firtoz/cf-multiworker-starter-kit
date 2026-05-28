import { PRODUCT_PREFIX } from "alchemy-utils/worker-peer-scripts";

/** Machine-to-machine admin API (origins CRUD without browser session). */
export const AUTH_ADMIN_SECRET_HEADER = `x-${PRODUCT_PREFIX}-auth-admin-secret`;

/** Internal hostname for Service Binding `AUTH.fetch` (not resolved on the public internet). */
export const AUTH_INTERNAL_ORIGIN = "https://auth.internal";

export const AUTH_API_PREFIX = "/api/auth/";

export const AUTH_GET_SESSION_PATH = "/api/auth/get-session";

export const AUTH_SIGN_IN_ANONYMOUS_PATH = "/api/auth/sign-in/anonymous";

export const AUTH_PROVIDERS_PATH = "/api/auth/providers";

/** Anonymous guest sessions expire after this many days without a visit (Better Auth sliding `session`). */
export const GUEST_SESSION_RETENTION_DAYS = 7;
