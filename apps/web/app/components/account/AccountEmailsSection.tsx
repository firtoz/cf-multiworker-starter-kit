import {
	SubmitterSupersededError,
	SubmitterUnmountedError,
	useDynamicSubmitter,
} from "@firtoz/router-toolkit";
import type { AccountSummary, UserEmailSource } from "@internal/auth-db/api-schemas";
import { useCallback, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import { accountFormErrorMessage } from "~/lib/account-form-error";

const SOURCE_LABELS: Record<UserEmailSource, string> = {
	email: "Email sign-in",
	google: "Google",
	github: "GitHub",
	manual: "Added manually",
	profile: "Profile",
};

type RouteMod = typeof import("~/routes/authed/account");

type AccountEmailsSectionProps = {
	summary: AccountSummary;
};

export function AccountEmailsSection({ summary }: AccountEmailsSectionProps) {
	const submitter = useDynamicSubmitter<RouteMod>("/account", { keySuffix: "emails" });
	const { revalidate } = useRevalidator();
	const submitSeq = useRef(0);
	const [busyEmailId, setBusyEmailId] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);

	const submitEmailIntent = useCallback(
		async (intent: "setNotificationEmail" | "setSignInEmail", emailId: string) => {
			const id = ++submitSeq.current;
			setBusyEmailId(emailId);
			setActionError(null);
			setSaved(false);
			try {
				const data = await submitter.submitJson({ intent, emailId });
				if (id !== submitSeq.current) {
					return;
				}
				if (!data.success) {
					setActionError(accountFormErrorMessage(data));
					return;
				}
				setSaved(true);
				await revalidate();
			} catch (err) {
				if (err instanceof SubmitterSupersededError || err instanceof SubmitterUnmountedError) {
					return;
				}
				if (id !== submitSeq.current) {
					return;
				}
				throw err;
			} finally {
				if (id === submitSeq.current) {
					setBusyEmailId(null);
				}
			}
		},
		[revalidate, submitter],
	);

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
					{summary.emails.map((row) => {
						const busy = busyEmailId === row.id;
						return (
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
										<button
											type="button"
											disabled={busyEmailId !== null}
											className="text-xs rounded border border-gray-300 dark:border-gray-600 px-2 py-1 disabled:opacity-50"
											onClick={() => void submitEmailIntent("setNotificationEmail", row.id)}
										>
											{busy ? "Saving…" : "Use for notifications"}
										</button>
									)}
									{!row.isSignInEmail &&
									summary.signInMethods.some((m) => m.provider === "email" && m.linked) ? (
										<button
											type="button"
											disabled={busyEmailId !== null}
											className="text-xs rounded border border-gray-300 dark:border-gray-600 px-2 py-1 disabled:opacity-50"
											onClick={() => void submitEmailIntent("setSignInEmail", row.id)}
										>
											{busy ? "Saving…" : "Use for email sign-in"}
										</button>
									) : null}
									{!row.isSignInEmail &&
									!summary.signInMethods.some((m) => m.provider === "email" && m.linked) ? (
										<button
											type="button"
											disabled={busyEmailId !== null}
											className="text-xs rounded border border-gray-300 dark:border-gray-600 px-2 py-1 disabled:opacity-50"
											onClick={() => void submitEmailIntent("setSignInEmail", row.id)}
										>
											{busy ? "Saving…" : "Set as sign-in email"}
										</button>
									) : null}
								</div>
							</li>
						);
					})}
				</ul>
			)}
			{saved ? <p className="text-sm text-green-700 dark:text-green-400">Updated.</p> : null}
			{actionError ? <p className="text-sm text-red-600">{actionError}</p> : null}
		</section>
	);
}
