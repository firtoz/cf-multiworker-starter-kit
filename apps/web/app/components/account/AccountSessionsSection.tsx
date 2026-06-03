import {
	SubmitterSupersededError,
	SubmitterUnmountedError,
	useDynamicSubmitter,
} from "@firtoz/router-toolkit";
import type { AccountSessionRow } from "@internal/auth-db/api-schemas";
import { useCallback, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import { LocalDateTime } from "~/components/shared/LocalDateTime";
import { accountFormErrorMessage } from "~/lib/account-form-error";
import { formatSessionDevice } from "~/lib/format-session-device";
import { formatSessionIpAddress } from "~/lib/format-session-ip-address";

type RouteMod = typeof import("~/routes/authed/account");

type AccountSessionsSectionProps = {
	sessions: AccountSessionRow[];
	currentSessionId: string;
};

export function AccountSessionsSection({
	sessions,
	currentSessionId,
}: AccountSessionsSectionProps) {
	const submitter = useDynamicSubmitter<RouteMod>("/account", { keySuffix: "sessions" });
	const { revalidate } = useRevalidator();
	const submitSeq = useRef(0);
	const [actionError, setActionError] = useState<string | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [revokingOthers, setRevokingOthers] = useState(false);

	const isCurrentSession = (session: AccountSessionRow) =>
		session.isCurrent || session.id === currentSessionId;
	const otherSessions = sessions.filter((s) => !isCurrentSession(s));

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
				{sessions.map((session) => {
					const isCurrent = isCurrentSession(session);
					const device = formatSessionDevice(session.userAgent);
					const ipAddress = formatSessionIpAddress(session.ipAddress);
					return (
						<li
							key={session.id}
							className={`rounded-lg border px-3 py-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between ${
								isCurrent
									? "border-green-300 bg-green-50/80 dark:border-green-800 dark:bg-green-950/30"
									: "border-gray-200 dark:border-gray-700"
							}`}
						>
							<div className="min-w-0 flex-1">
								<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
									<p className="font-medium" title={device.raw ?? undefined}>
										{device.label}
									</p>
									{isCurrent ? (
										<span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/60 dark:text-green-300">
											This is you
										</span>
									) : null}
								</div>
								{device.label === "Unknown device" && device.raw ? (
									<p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 wrap-break-word">
										{device.raw}
									</p>
								) : null}
								<p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
									Last active <LocalDateTime value={session.updatedAt} />
									{ipAddress ? ` · ${ipAddress}` : ""}
								</p>
								<p className="text-xs text-gray-500 dark:text-gray-400">
									Expires <LocalDateTime value={session.expiresAt} />
								</p>
							</div>
							{isCurrent ? null : (
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
					);
				})}
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
