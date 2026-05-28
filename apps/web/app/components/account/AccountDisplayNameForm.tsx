import { PROFILE_NAME_MAX_CHARS } from "@internal/auth-client";
import { useFetcher } from "react-router";

type AccountDisplayNameFormProps = {
	initialName: string;
};

export function AccountDisplayNameForm({ initialName }: AccountDisplayNameFormProps) {
	const fetcher = useFetcher();
	const busy = fetcher.state !== "idle";
	const data = fetcher.data as
		| { success: true; result: { ok: true } }
		| { success: false; error: string }
		| undefined;
	const error = data?.success === false ? data.error : null;
	const saved = data?.success === true;

	return (
		<form
			method="post"
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
				defaultValue={initialName}
				placeholder="How you appear in chat"
			/>
			<button
				type="submit"
				name="intent"
				value="saveDisplayName"
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
