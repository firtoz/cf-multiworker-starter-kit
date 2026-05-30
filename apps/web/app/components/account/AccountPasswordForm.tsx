import {
	SubmitterSupersededError,
	SubmitterUnmountedError,
	useDynamicSubmitter,
} from "@firtoz/router-toolkit";
import { type SubmitEvent, useCallback, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import { accountFormErrorMessage } from "~/lib/account-form-error";

type RouteMod = typeof import("~/routes/account");

type AccountPasswordFormProps = {
	hasPassword: boolean;
};

export function AccountPasswordForm({ hasPassword }: AccountPasswordFormProps) {
	const submitter = useDynamicSubmitter<RouteMod>("/account", { keySuffix: "password" });
	const { revalidate } = useRevalidator();
	const submitSeq = useRef(0);
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [clientError, setClientError] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [saved, setSaved] = useState(false);

	const handleSubmit = useCallback(
		async (event: SubmitEvent<HTMLFormElement>) => {
			event.preventDefault();
			setClientError(null);
			setActionError(null);
			setSaved(false);

			if (newPassword !== confirmPassword) {
				setClientError("New passwords do not match");
				return;
			}
			if (newPassword.length < 8) {
				setClientError("Password must be at least 8 characters");
				return;
			}

			const id = ++submitSeq.current;
			setBusy(true);
			try {
				const data = await submitter.submitJson(
					hasPassword
						? {
								intent: "changePassword",
								currentPassword,
								newPassword,
							}
						: {
								intent: "setPassword",
								newPassword,
							},
				);
				if (id !== submitSeq.current) {
					return;
				}
				if (!data.success) {
					setActionError(accountFormErrorMessage(data));
					return;
				}
				setSaved(true);
				setCurrentPassword("");
				setNewPassword("");
				setConfirmPassword("");
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
					setBusy(false);
				}
			}
		},
		[confirmPassword, currentPassword, hasPassword, newPassword, revalidate, submitter],
	);

	return (
		<section className="mt-6 flex flex-col gap-3 border-t border-gray-200 dark:border-gray-700 pt-6">
			<h2 className="text-lg font-semibold">Password</h2>
			<p className="text-sm text-gray-600 dark:text-gray-400">
				{hasPassword
					? "Change your email sign-in password."
					: "Set a password to sign in with email (for example after using Google or GitHub)."}
			</p>
			<form className="flex flex-col gap-3 max-w-sm" onSubmit={(event) => void handleSubmit(event)}>
				{hasPassword ? (
					<label className="flex flex-col gap-1 text-sm">
						<span className="font-medium">Current password</span>
						<input
							type="password"
							required
							autoComplete="current-password"
							className="border rounded px-3 py-2 dark:bg-gray-900"
							value={currentPassword}
							onChange={(event) => setCurrentPassword(event.target.value)}
						/>
					</label>
				) : null}
				<label className="flex flex-col gap-1 text-sm">
					<span className="font-medium">{hasPassword ? "New password" : "Password"}</span>
					<input
						type="password"
						required
						minLength={8}
						autoComplete="new-password"
						className="border rounded px-3 py-2 dark:bg-gray-900"
						value={newPassword}
						onChange={(event) => setNewPassword(event.target.value)}
					/>
				</label>
				<label className="flex flex-col gap-1 text-sm">
					<span className="font-medium">Confirm password</span>
					<input
						type="password"
						required
						minLength={8}
						autoComplete="new-password"
						className="border rounded px-3 py-2 dark:bg-gray-900"
						value={confirmPassword}
						onChange={(event) => setConfirmPassword(event.target.value)}
					/>
				</label>
				<button
					type="submit"
					disabled={busy}
					className="self-start rounded bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-4 py-2 text-sm disabled:opacity-50"
				>
					{busy ? "Saving…" : hasPassword ? "Change password" : "Set password"}
				</button>
			</form>
			{saved ? <p className="text-sm text-green-700 dark:text-green-400">Password saved.</p> : null}
			{clientError ? <p className="text-sm text-red-600">{clientError}</p> : null}
			{actionError ? <p className="text-sm text-red-600">{actionError}</p> : null}
		</section>
	);
}
