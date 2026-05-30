import {
	SubmitterSupersededError,
	SubmitterUnmountedError,
	useDynamicSubmitter,
} from "@firtoz/router-toolkit";
import type { AccountSessionRow } from "@internal/auth-db/api-schemas";
import { useCallback, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import { accountFormErrorMessage } from "~/lib/account-form-error";

type RouteMod = typeof import("~/routes/account");

type AccountSessionsSectionProps = {
	sessions: AccountSessionRow[];
};

function formatSessionWhen(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) {
		return iso;
	}
	return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function summarizeUserAgent(raw: string | null | undefined): string {
	if (!raw?.trim()) {
		return "Unknown device";
	}
	const ua = raw.trim();
	if (ua.length <= 72) {
		return ua;
	}
	return `${ua.slice(0, 69)}…`;
}

export function AccountSessionsSection({ sessions }: AccountSessionsSectionProps) {
	const submitter = useDynamicSubmitter<RouteMod>("/account", { keySuffix: "sessions" });
	const { revalidate } = useRevalidator();
	const submitSeq = useRef(0);
	const [actionError, setActionError] = useState<string | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [revokingOthers, setRevokingOthers] = useState(false);

	const otherSessions = sessions.filter((s) => !s.isCurrent);

	const runAction = useCallback(
		async (intent: "revokeSession" | "revokeOtherSessions", sessionId?: string) => {
			const id = ++submitSeq.current;
			setActionError(null);
			if (intent === "revokeSession" && sessionId) {
				setBusyId(sessionId);
			} else {
				setRevokingOthers(true);
			}
			try {
				const data = await submitter.submitJson(
					intent === "revokeSession" && sessionId
						? { intent: "revokeSession", sessionId }
						: { intent: "revokeOtherSessions" },
				);
				if (id !== submitSeq.current) {
					return;
				}
				if (!data.success) {
					setActionError(accountFormErrorMessage(data));
					return;
				}
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
					setBusyId(null);
					setRevokingOthers(false);
				}
			}
		},
		[revalidate, submitter],
	);

	return (
		<section className="mt-6 flex flex-col gap-3 border-t border-gray-200 dark:border-gray-700 pt-6">
			<h2 className="text-lg font-semibold">Active sessions</h2>
			<p className="text-sm text-gray-600 dark:text-gray-400">
				Devices and browsers signed in to your account. Sign out sessions you do not recognize.
			</p>
			<ul className="flex flex-col gap-2 text-sm">
				{sessions.map((session) => (
					<li
						key={session.id}
						className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
					>
						<div className="min-w-0">
							<p className="font-medium truncate">
								{summarizeUserAgent(session.userAgent)}
								{session.isCurrent ? (
									<span className="ml-2 text-xs font-normal text-green-700 dark:text-green-400">
										This device
									</span>
								) : null}
							</p>
							<p className="text-xs text-gray-500 dark:text-gray-400">
								Last active {formatSessionWhen(session.updatedAt)}
								{session.ipAddress ? ` · ${session.ipAddress}` : ""}
							</p>
							<p className="text-xs text-gray-500 dark:text-gray-400">
								Expires {formatSessionWhen(session.expiresAt)}
							</p>
						</div>
						{session.isCurrent ? null : (
							<button
								type="button"
								disabled={busyId === session.id || revokingOthers}
								className="self-start sm:self-center text-sm text-red-600 dark:text-red-400 underline disabled:opacity-50"
								onClick={() => void runAction("revokeSession", session.id)}
							>
								{busyId === session.id ? "Signing out…" : "Sign out"}
							</button>
						)}
					</li>
				))}
			</ul>
			{otherSessions.length > 0 ? (
				<button
					type="button"
					disabled={revokingOthers || busyId !== null}
					className="self-start rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm disabled:opacity-50"
					onClick={() => void runAction("revokeOtherSessions")}
				>
					{revokingOthers ? "Signing out others…" : "Sign out all other sessions"}
				</button>
			) : null}
			{actionError ? <p className="text-sm text-red-600">{actionError}</p> : null}
		</section>
	);
}
