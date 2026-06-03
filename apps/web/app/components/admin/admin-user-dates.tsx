import type { AdminUserRow } from "@internal/auth-db/api-schemas";
import { LocalDateTime } from "~/components/shared/LocalDateTime";

function toDate(value: Date | string | null | undefined): Date | null {
	if (value == null) {
		return null;
	}
	const d = value instanceof Date ? value : new Date(value);
	return Number.isNaN(d.getTime()) ? null : d;
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
	if (user.isAnonymous === true) {
		return (
			<div className="flex flex-col gap-0.5">
				<LocalDateTime value={expires} className={expired ? "text-gray-500" : undefined} />
				<span className="text-xs text-gray-500 leading-snug">
					{expired
						? `Expired · ${guestRetentionDays}-day sliding window`
						: `Extends on visit · ${guestRetentionDays}d max idle`}
				</span>
			</div>
		);
	}

	return <LocalDateTime value={expires} className={expired ? "text-gray-500" : undefined} />;
}
