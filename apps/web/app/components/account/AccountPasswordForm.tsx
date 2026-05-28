import { type FormEvent, useCallback, useState } from "react";
import { useFetcher } from "react-router";

type AccountPasswordFormProps = {
	hasPassword: boolean;
};

export function AccountPasswordForm({ hasPassword }: AccountPasswordFormProps) {
	const fetcher = useFetcher();
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [clientError, setClientError] = useState<string | null>(null);

	const busy = fetcher.state !== "idle";
	const data = fetcher.data as
		| { success: true; result: { ok: true } }
		| { success: false; error: string }
		| undefined;
	const actionError = data?.success === false ? data.error : undefined;
	const saved = data?.success === true;

	const onSubmit = useCallback(
		(e: FormEvent) => {
			setClientError(null);
			if (newPassword !== confirmPassword) {
				e.preventDefault();
				setClientError("New passwords do not match");
				return;
			}
			if (newPassword.length < 8) {
				e.preventDefault();
				setClientError("Password must be at least 8 characters");
			}
		},
		[newPassword, confirmPassword],
	);

	return (
		<section className="mt-6 flex flex-col gap-3 border-t border-gray-200 dark:border-gray-700 pt-6">
			<h2 className="text-lg font-semibold">Password</h2>
			<p className="text-sm text-gray-600 dark:text-gray-400">
				{hasPassword
					? "Change your email sign-in password."
					: "Set a password to sign in with email (for example after using Google or GitHub)."}
			</p>
			<fetcher.Form method="post" className="flex flex-col gap-3 max-w-sm" onSubmit={onSubmit}>
				<input type="hidden" name="intent" value={hasPassword ? "changePassword" : "setPassword"} />
				{hasPassword ? (
					<label className="flex flex-col gap-1 text-sm">
						<span className="font-medium">Current password</span>
						<input
							type="password"
							name="currentPassword"
							required
							autoComplete="current-password"
							className="border rounded px-3 py-2 dark:bg-gray-900"
							value={currentPassword}
							onChange={(e) => setCurrentPassword(e.target.value)}
						/>
					</label>
				) : null}
				<label className="flex flex-col gap-1 text-sm">
					<span className="font-medium">{hasPassword ? "New password" : "Password"}</span>
					<input
						type="password"
						name="newPassword"
						required
						minLength={8}
						autoComplete="new-password"
						className="border rounded px-3 py-2 dark:bg-gray-900"
						value={newPassword}
						onChange={(e) => setNewPassword(e.target.value)}
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
						onChange={(e) => setConfirmPassword(e.target.value)}
					/>
				</label>
				<button
					type="submit"
					disabled={busy}
					className="self-start rounded bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-4 py-2 text-sm disabled:opacity-50"
				>
					{busy ? "Saving…" : hasPassword ? "Change password" : "Set password"}
				</button>
			</fetcher.Form>
			{saved ? <p className="text-sm text-green-700 dark:text-green-400">Password saved.</p> : null}
			{clientError ? <p className="text-sm text-red-600">{clientError}</p> : null}
			{actionError ? <p className="text-sm text-red-600">{actionError}</p> : null}
		</section>
	);
}
