import type { AuthRole } from "@internal/auth-db/schema";
import { AUTH_ROLES } from "@internal/auth-db/schema";

export type { AuthRole };
export { AUTH_ROLES };

export type AuthUser = {
	id: string;
	email: string;
	name?: string;
	image?: string;
	role: AuthRole;
	/** Better Auth anonymous plugin — guest chat identity with sliding session expiry. */
	isAnonymous?: boolean;
};

export type AuthSessionPayload = {
	id: string;
	expiresAt: string;
};

export type AuthSession = {
	user: AuthUser;
	session: AuthSessionPayload;
};

export function isAdminUser(
	user: AuthUser | null | undefined,
): user is AuthUser & { role: "admin" } {
	return user?.role === "admin";
}

export function parseAuthRole(raw: unknown): AuthRole {
	return AUTH_ROLES.includes(raw as AuthRole) ? (raw as AuthRole) : "user";
}
