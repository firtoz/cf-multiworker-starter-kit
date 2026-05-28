import { href, Link } from "react-router";

type ChatGuestRetentionNoticeProps = {
	guestRetentionDays: number;
	sessionExpiresAt: string;
};

function noticeBody(guestRetentionDays: number, sessionExpiresAt: string) {
	return (
		<>
			Your guest name and history on this device last <strong>{guestRetentionDays} days</strong>{" "}
			from your last visit. Come back before <strong>{sessionExpiresAt}</strong> to keep them, or{" "}
			<Link className="underline font-medium" to={href("/guest/upgrade")}>
				create an account
			</Link>{" "}
			to keep them permanently.
		</>
	);
}

export function ChatGuestRetentionNotice({
	guestRetentionDays,
	sessionExpiresAt,
}: ChatGuestRetentionNoticeProps) {
	const body = noticeBody(guestRetentionDays, sessionExpiresAt);
	const boxClass =
		"text-sm text-sky-900 dark:text-sky-100 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded-lg";

	return (
		<>
			<details className={`md:hidden ${boxClass}`}>
				<summary className="cursor-pointer list-none px-3 py-2 marker:content-none [&::-webkit-details-marker]:hidden">
					<span className="font-medium">Guest session</span>
					<span className="text-sky-800/80 dark:text-sky-200/80"> · {guestRetentionDays} days</span>
				</summary>
				<p className="px-3 pb-2 pt-0">{body}</p>
			</details>
			<p className={`hidden md:block px-3 py-2 ${boxClass}`}>{body}</p>
		</>
	);
}
