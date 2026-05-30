import { AUTH_SERVICE_BINDING_HOST } from "@internal/auth-db/constants";
import { betterAuthPath } from "auth-worker/better-auth";
import { guestApiPath } from "auth-worker/guest-upgrade";

/** Web worker proxy prefix for Better Auth routes (`/api/auth/*`). */
export const authApiPrefix = `${betterAuthPath}/` as const;

/** Web worker proxy prefix for guest routes (`/api/guest/*`). */
export const guestApiPrefix = `${guestApiPath}/` as const;

/** Internal origin for service-binding `AUTH.fetch` (not resolved on the public internet). */
export const AUTH_INTERNAL_ORIGIN = `https://${AUTH_SERVICE_BINDING_HOST}` as const;

/**
 * Web worker machine-admin route: post-deploy bootstrap admin sync.
 * Requires {@link AUTH_ADMIN_SECRET_HEADER}; returns 404 when unauthorized.
 */
export const machineAdminBootstrapSyncPath = "/api/internal/admin/bootstrap-sync" as const;

/** Anonymous guest sessions expire after this many days without a visit (Better Auth sliding `session`). */
export const GUEST_SESSION_RETENTION_DAYS = 7;
