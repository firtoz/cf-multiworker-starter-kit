import type { AccountSummary } from "@internal/auth-client";
import { useFetcher } from "react-router";

const SOURCE_LABELS: Record<AccountSummary["emails"][number]["source"], string> = {
	email: "Email sign-in",
	google: "Google",
	github: "GitHub",
	manual: "Added manually",
	profile: "Profile",
};

type AccountEmailsSectionProps = {
	summary: AccountSummary;
};

export function AccountEmailsSection({ summary }: AccountEmailsSectionProps) {
	const fetcher = useFetcher();
	const busy = fetcher.state !== "idle";
	const data = fetcher.data as
		| { success: true; result: { ok: true } }
		| { success: false; error: string }
		| undefined;
	const actionError = data?.success === false ? data.error : undefined;
	const saved = data?.success === true;

	return (
		<section className="mt-6 flex flex-col gap-3 border-t border-gray-200 dark:border-gray-700 pt-6">
			<h2 className="text-lg font-semibold">Email addresses</h2>
			<p className="text-sm text-gray-600 dark:text-gray-400">
				Addresses we know from how you sign in. Connect another provider above to add a different
				email. You can choose which one we&apos;d use for notifications later; email/password
				sign-in uses the one marked &quot;Sign-in email&quot;.
			</p>
			{summary.emails.length === 0 ? (
				<p className="text-sm text-gray-500">No emails recorded yet.</p>
			) : (
				<ul className="flex flex-col gap-2 text-sm">
					{summary.emails.map((row) => (
						<li
							key={row.id}
							className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2"
						>
							<div className="font-medium">{row.email}</div>
							<div className="text-gray-600 dark:text-gray-400 text-xs mt-1 flex flex-wrap gap-x-3 gap-y-1">
								<span>{SOURCE_LABELS[row.source]}</span>
								{row.isSignInEmail ? (
									<span className="text-blue-700 dark:text-blue-400">Sign-in email</span>
								) : null}
								{row.isNotificationPreferred ? (
									<span className="text-green-700 dark:text-green-400">Notifications</span>
								) : null}
								{row.verified ? null : <span className="text-amber-700">Unverified</span>}
							</div>
							<div className="mt-2 flex flex-wrap gap-2">
								{row.isNotificationPreferred ? null : (
									<fetcher.Form method="post">
										<input type="hidden" name="intent" value="setNotificationEmail" />
										<input type="hidden" name="emailId" value={row.id} />
										<button
											type="submit"
											disabled={busy}
											className="text-xs rounded border border-gray-300 dark:border-gray-600 px-2 py-1 disabled:opacity-50"
										>
											Use for notifications
										</button>
									</fetcher.Form>
								)}
								{!row.isSignInEmail &&
								summary.signInMethods.some((m) => m.provider === "email" && m.linked) ? (
									<fetcher.Form method="post">
										<input type="hidden" name="intent" value="setSignInEmail" />
										<input type="hidden" name="emailId" value={row.id} />
										<button
											type="submit"
											disabled={busy}
											className="text-xs rounded border border-gray-300 dark:border-gray-600 px-2 py-1 disabled:opacity-50"
										>
											Use for email sign-in
										</button>
									</fetcher.Form>
								) : null}
								{!row.isSignInEmail &&
								!summary.signInMethods.some((m) => m.provider === "email" && m.linked) ? (
									<fetcher.Form method="post">
										<input type="hidden" name="intent" value="setSignInEmail" />
										<input type="hidden" name="emailId" value={row.id} />
										<button
											type="submit"
											disabled={busy}
											className="text-xs rounded border border-gray-300 dark:border-gray-600 px-2 py-1 disabled:opacity-50"
										>
											Set as sign-in email
										</button>
									</fetcher.Form>
								) : null}
							</div>
						</li>
					))}
				</ul>
			)}
			{saved ? <p className="text-sm text-green-700 dark:text-green-400">Updated.</p> : null}
			{actionError ? <p className="text-sm text-red-600">{actionError}</p> : null}
		</section>
	);
}
