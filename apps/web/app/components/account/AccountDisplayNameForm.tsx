import {
	SubmitterSupersededError,
	SubmitterUnmountedError,
	useDynamicSubmitter,
} from "@firtoz/router-toolkit";
import { PROFILE_NAME_MAX_CHARS } from "@internal/auth-db/constants";
import { type SubmitEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import { accountFormErrorMessage } from "~/lib/account-form-error";

type RouteMod = typeof import("~/routes/account");

type AccountDisplayNameFormProps = {
	initialName: string;
};

export function AccountDisplayNameForm({ initialName }: AccountDisplayNameFormProps) {
	const submitter = useDynamicSubmitter<RouteMod>("/account", { keySuffix: "displayName" });
	const { revalidate } = useRevalidator();
	const submitSeq = useRef(0);
	const [displayName, setDisplayName] = useState(initialName);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);

	useEffect(() => {
		setDisplayName(initialName);
	}, [initialName]);

	const handleSubmit = useCallback(
		async (event: SubmitEvent<HTMLFormElement>) => {
			event.preventDefault();
			const id = ++submitSeq.current;
			setBusy(true);
			setError(null);
			setSaved(false);
			try {
				const data = await submitter.submitJson({
					intent: "saveDisplayName",
					displayName: displayName.trim(),
				});
				if (id !== submitSeq.current) {
					return;
				}
				if (!data.success) {
					setError(accountFormErrorMessage(data));
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
					setBusy(false);
				}
			}
		},
		[displayName, revalidate, submitter],
	);

	return (
		<form
			method="post"
			onSubmit={(event) => void handleSubmit(event)}
			className="mt-6 flex flex-col gap-3 border-t border-gray-200 dark:border-gray-700 pt-6"
		>
			<h2 className="text-lg font-semibold">Display name</h2>
			<p className="text-sm text-gray-600 dark:text-gray-400">
				Used in chat and shown to other users. Set this before joining a room (
				{PROFILE_NAME_MAX_CHARS} characters max).
			</p>
			<label className="text-sm font-medium" htmlFor="displayName">
				Display name
			</label>
			<input
				className="border rounded px-3 py-2 text-sm dark:bg-gray-900"
				id="displayName"
				name="displayName"
				type="text"
				required
				minLength={1}
				maxLength={PROFILE_NAME_MAX_CHARS}
				value={displayName}
				onChange={(event) => setDisplayName(event.target.value)}
				placeholder="How you appear in chat"
			/>
			<button
				type="submit"
				className="self-start rounded bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-4 py-2 text-sm disabled:opacity-50"
				disabled={busy}
			>
				{busy ? "Saving…" : "Save display name"}
			</button>
			{saved ? <p className="text-sm text-green-700 dark:text-green-400">Saved.</p> : null}
			{error ? <p className="text-sm text-red-600">{error}</p> : null}
		</form>
	);
}
