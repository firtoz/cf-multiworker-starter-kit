import type { AuthUser } from "./roles";

/** Display name from account profile (`user.name`), not derived from email. */
export function accountDisplayName(user: AuthUser): string | null {
	const name = user.name?.trim();
	return name && name.length > 0 ? name : null;
}

export function hasAccountDisplayName(user: AuthUser): boolean {
	return accountDisplayName(user) !== null;
}
