/** Parse `AUTH_BOOTSTRAP_ADMIN_EMAILS` (comma-separated, case-insensitive). */
export function bootstrapAdminEmails(raw: string): Set<string> {
	return new Set(
		raw
			.split(",")
			.map((e) => e.trim().toLowerCase())
			.filter((e) => e.length > 0),
	);
}

/** Stable fingerprint for deploy scripts / CI cache (sorted normalized emails). */
export function bootstrapAdminFingerprint(raw: string): string {
	return [...bootstrapAdminEmails(raw)].sort().join(",");
}
