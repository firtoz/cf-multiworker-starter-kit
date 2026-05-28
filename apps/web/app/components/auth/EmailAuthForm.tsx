import { type FormEvent, useCallback, useState } from "react";
import { signInWithEmail, signUpWithEmail } from "~/lib/auth-email-client";

type EmailAuthFormProps = {
	redirectTo: string;
};

export function EmailAuthForm({ redirectTo }: EmailAuthFormProps) {
	const callbackURL = `${window.location.origin}${redirectTo.startsWith("/") ? redirectTo : `/${redirectTo}`}`;
	const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const onSubmit = useCallback(
		async (e: FormEvent) => {
			e.preventDefault();
			setError(null);
			setBusy(true);
			try {
				const result =
					mode === "sign-in"
						? await signInWithEmail(email.trim(), password, callbackURL)
						: await signUpWithEmail(name.trim(), email.trim(), password, callbackURL);
				if (!result.ok) {
					setError(result.message);
				}
			} finally {
				setBusy(false);
			}
		},
		[mode, name, email, password, callbackURL],
	);

	return (
		<form
			className="flex flex-col gap-3 border-t border-gray-200 dark:border-gray-700 pt-4"
			onSubmit={onSubmit}
		>
			<div className="flex gap-2 text-sm">
				<button
					type="button"
					className={`px-3 py-1 rounded-md ${mode === "sign-in" ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900" : "text-gray-600 dark:text-gray-400"}`}
					onClick={() => setMode("sign-in")}
				>
					Sign in
				</button>
				<button
					type="button"
					className={`px-3 py-1 rounded-md ${mode === "sign-up" ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900" : "text-gray-600 dark:text-gray-400"}`}
					onClick={() => setMode("sign-up")}
				>
					Create account
				</button>
			</div>
			{mode === "sign-up" && (
				<label className="flex flex-col gap-1 text-sm">
					<span className="text-gray-700 dark:text-gray-300">Name</span>
					<input
						className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-900"
						value={name}
						onChange={(e) => setName(e.target.value)}
						autoComplete="name"
						required
					/>
				</label>
			)}
			<label className="flex flex-col gap-1 text-sm">
				<span className="text-gray-700 dark:text-gray-300">Email</span>
				<input
					type="email"
					className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-900"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					autoComplete="email"
					required
				/>
			</label>
			<label className="flex flex-col gap-1 text-sm">
				<span className="text-gray-700 dark:text-gray-300">Password</span>
				<input
					type="password"
					className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-900"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
					required
					minLength={8}
				/>
			</label>
			{error && <p className="text-sm text-red-600">{error}</p>}
			<button
				type="submit"
				disabled={busy}
				className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-4 py-2 text-sm"
			>
				{busy ? "Please wait…" : mode === "sign-in" ? "Sign in with email" : "Create account"}
			</button>
		</form>
	);
}
