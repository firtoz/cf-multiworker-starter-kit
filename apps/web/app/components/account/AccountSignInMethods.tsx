import type { AccountSummary } from "@internal/auth-client";
import { useCallback, useEffect, useState } from "react";
import { BETTER_AUTH_OAUTH_ERROR_QUERY } from "~/lib/auth-link-error";
import { GoogleOAuthPortlessWarning } from "~/components/auth/GoogleOAuthPortlessWarning";
import { authCallbackUrl } from "~/lib/auth-callback-url";
import { linkSocialProvider } from "~/lib/auth-email-client";

const PROVIDER_LABELS = {
	email: "Email & password",
	google: "Google",
	github: "GitHub",
} as const;

type AccountSignInMethodsProps = {
	summary: AccountSummary;
	/** Path only (e.g. `/account`); absolute URL is built from `window.location.origin`. */
	accountPath: string;
	googlePortlessWarning?: string;
	/** Shown after OAuth link redirect (e.g. provider already on another user). */
	linkErrorMessage?: string;
};

export function AccountSignInMethods({
	summary,
	accountPath,
	googlePortlessWarning,
	linkErrorMessage,
}: AccountSignInMethodsProps) {
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState<"google" | "github" | null>(null);

	useEffect(() => {
		if (!linkErrorMessage) {
			return;
		}
		const params = new URLSearchParams(window.location.search);
		if (!params.has(BETTER_AUTH_OAUTH_ERROR_QUERY)) {
			return;
		}
		params.delete(BETTER_AUTH_OAUTH_ERROR_QUERY);
		const q = params.toString();
		const path = window.location.pathname;
		window.history.replaceState(null, "", q ? `${path}?${q}` : path);
	}, [linkErrorMessage]);

	const onLink = useCallback(
		async (provider: "google" | "github") => {
			setError(null);
			setBusy(provider);
			try {
				const result = await linkSocialProvider(provider, authCallbackUrl(accountPath));
				if (!result.ok) {
					setError(result.message);
				}
			} finally {
				setBusy(null);
			}
		},
		[accountPath],
	);

	return (
		<section className="mt-6 flex flex-col gap-3 border-t border-gray-200 dark:border-gray-700 pt-6">
			<h2 className="text-lg font-semibold">Sign-in methods</h2>
			<p className="text-sm text-gray-600 dark:text-gray-400">
				Each provider can use a different email address. Your account is identified by an internal
				id, not by email.
			</p>
			{googlePortlessWarning && summary.providers.google ? (
				<GoogleOAuthPortlessWarning message={googlePortlessWarning} />
			) : null}
			{linkErrorMessage ? (
				<p
					className="text-sm text-red-700 dark:text-red-400 rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 px-3 py-2"
					role="alert"
				>
					{linkErrorMessage}
				</p>
			) : null}
			<ul className="flex flex-col gap-2 text-sm">
				{summary.signInMethods
					.filter((method) => {
						if (method.provider === "google") {
							return summary.providers.google;
						}
						if (method.provider === "github") {
							return summary.providers.github;
						}
						return true;
					})
					.map((method) => {
						const label = PROVIDER_LABELS[method.provider];
						const canLink = !method.linked;
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
									) : null}
								</div>
								{canLink && (method.provider === "google" || method.provider === "github") ? (
									<button
										type="button"
										disabled={
											busy !== null ||
											(method.provider === "google" && Boolean(googlePortlessWarning))
										}
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
