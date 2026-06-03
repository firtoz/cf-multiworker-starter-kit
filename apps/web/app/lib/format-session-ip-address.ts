const UNSPECIFIED_IPV6_PARTS = new Set(["", "0", "0000"]);

function isUnspecifiedIpv6(value: string): boolean {
	const normalized = value.toLowerCase();
	if (normalized === "::") {
		return true;
	}
	const parts = normalized.split(":");
	return parts.length >= 2 && parts.every((part) => UNSPECIFIED_IPV6_PARTS.has(part));
}

/** Returns a displayable client IP, omitting unspecified placeholder addresses from local/dev. */
export function formatSessionIpAddress(ipAddress: string | null | undefined): string | null {
	const value = ipAddress?.trim();
	if (!value) {
		return null;
	}
	if (value === "0.0.0.0" || isUnspecifiedIpv6(value)) {
		return null;
	}
	return value;
}
