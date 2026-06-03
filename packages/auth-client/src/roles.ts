import type { BetterAuthGetSessionResponse } from "@internal/auth-db/api-schemas";

export type AuthSession = NonNullable<BetterAuthGetSessionResponse>;

export type AuthUser = AuthSession["user"];
export type AuthSessionPayload = AuthSession["session"];

export function isAdminUser(
	user: AuthUser | null | undefined,
): user is AuthUser & { role: "admin" } {
	return user?.role === "admin";
}
