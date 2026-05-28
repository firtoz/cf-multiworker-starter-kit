import type { AccountSummary } from "@internal/auth-client";
import { useCallback, useState } from "react";
import { linkSocialProvider } from "~/lib/auth-email-client";

const PROVIDER_LABELS = {
	email: "Email & password",
	google: "Google",
	github: "GitHub",
} as const;

type AccountSignInMethodsProps = {
	summary: AccountSummary;
	callbackURL: string;
};

export function AccountSignInMethods({ summary, callbackURL }: AccountSignInMethodsProps) {
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState<"google" | "github" | null>(null);

	const onLink = useCallback(
		async (provider: "google" | "github") => {
			setError(null);
			setBusy(provider);
			try {
				const result = await linkSocialProvider(provider, callbackURL);
				if (!result.ok) {
					setError(result.message);
				}
			} finally {
				setBusy(null);
			}
		},
		[callbackURL],
	);

	return (
		<section className="mt-6 flex flex-col gap-3 border-t border-gray-200 dark:border-gray-700 pt-6">
			<h2 className="text-lg font-semibold">Sign-in methods</h2>
			<p className="text-sm text-gray-600 dark:text-gray-400">
				Each provider can use a different email address. Your account is identified by an internal
				id, not by email.
			</p>
			<ul className="flex flex-col gap-2 text-sm">
				{summary.signInMethods.map((method) => {
					const label = PROVIDER_LABELS[method.provider];
					const canLink =
						!method.linked &&
						((method.provider === "google" && summary.providers.google) ||
							(method.provider === "github" && summary.providers.github));
					return (
						<li
							key={method.provider}
							className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2"
						>
							<div>
								<span className="font-medium">{label}</span>
								{method.linked ? (
									<span className="ml-2 text-green-700 dark:text-green-400">Connected</span>
								) : (
									<span className="ml-2 text-gray-500">Not connected</span>
								)}
								{method.email ? (
									<p className="text-gray-600 dark:text-gray-400 mt-0.5">{method.email}</p>
								) : method.linked && method.provider !== "email" ? (
									<p className="text-gray-500 mt-0.5 text-xs">Email will appear after next visit</p>
								) : null}
							</div>
							{canLink && (method.provider === "google" || method.provider === "github") ? (
								<button
									type="button"
									disabled={busy !== null}
									className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1 text-sm disabled:opacity-50"
									onClick={() => onLink(method.provider as "google" | "github")}
								>
									{busy === method.provider ? "Redirecting…" : `Connect ${label}`}
								</button>
							) : method.provider === "email" && !method.linked ? (
								<span className="text-xs text-gray-500">Set a password below</span>
							) : null}
						</li>
					);
				})}
			</ul>
			{error ? <p className="text-sm text-red-600">{error}</p> : null}
		</section>
	);
}
