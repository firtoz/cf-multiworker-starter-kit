import type { AdminUserRow } from "@internal/auth-client";

function toDate(value: Date | string | null | undefined): Date | null {
	if (value == null) {
		return null;
	}
	const d = value instanceof Date ? value : new Date(value);
	return Number.isNaN(d.getTime()) ? null : d;
}

export function formatAdminTimestamp(value: Date | string | null | undefined): string {
	const d = toDate(value);
	if (!d) {
		return "—";
	}
	return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function formatAdminUserType(user: AdminUserRow): string {
	if (user.isAnonymous === true) {
		return "Guest";
	}
	return user.role === "admin" ? "Admin" : "Member";
}

type SessionExpiryCellProps = {
	user: AdminUserRow;
	guestRetentionDays: number;
};

export function AdminUserSessionExpiryCell({ user, guestRetentionDays }: SessionExpiryCellProps) {
	const expires = toDate(user.sessionExpiresAt);
	if (!expires) {
		if (user.isAnonymous === true) {
			return <span className="text-gray-500">No active session</span>;
		}
		return <span className="text-gray-500">—</span>;
	}

	const expired = expires.getTime() <= Date.now();
	const label = formatAdminTimestamp(expires);

	if (user.isAnonymous === true) {
		return (
			<div className="flex flex-col gap-0.5">
				<time dateTime={expires.toISOString()} className={expired ? "text-gray-500" : undefined}>
					{label}
				</time>
				<span className="text-xs text-gray-500 leading-snug">
					{expired
						? `Expired · ${guestRetentionDays}-day sliding window`
						: `Extends on visit · ${guestRetentionDays}d max idle`}
				</span>
			</div>
		);
	}

	return (
		<time dateTime={expires.toISOString()} className={expired ? "text-gray-500" : undefined}>
			{label}
		</time>
	);
}
