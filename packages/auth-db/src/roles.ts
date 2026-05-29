import { AUTH_ROLES, type AuthRole } from "./schema";

export function parseAuthRole(raw: unknown): AuthRole {
	return AUTH_ROLES.includes(raw as AuthRole) ? (raw as AuthRole) : "user";
}
