/** Domain part of an email after `@`, lowercased; null when not a valid address. */
export function emailDomain(email: string): string | null {
	const normalized = email.trim().toLowerCase();
	const at = normalized.lastIndexOf("@");
	if (at <= 0 || at === normalized.length - 1) {
		return null;
	}
	return normalized.slice(at + 1);
}

/** True when `email` uses the configured anonymous guest domain (exact match, not substring). */
export function isSyntheticGuestEmail(email: string, guestEmailDomain: string): boolean {
	const domain = emailDomain(email);
	const guestDomain = guestEmailDomain.trim().toLowerCase();
	return domain !== null && domain === guestDomain;
}
