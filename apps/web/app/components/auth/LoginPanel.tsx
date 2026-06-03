import type { AuthProviders } from "@internal/auth-client/session";
import { useCallback, useEffect, useState } from "react";
import { EmailAuthForm } from "~/components/auth/EmailAuthForm";
import { GoogleOAuthPortlessWarning } from "~/components/auth/GoogleOAuthPortlessWarning";
import { OAuthStagingProxyNotice } from "~/components/auth/OAuthStagingProxyNotice";
import { authCallbackUrl } from "~/lib/auth-callback-url";
import { signInWithSocial } from "~/lib/auth-email-client";
import { BETTER_AUTH_OAUTH_ERROR_QUERY } from "~/lib/auth-link-error";
import {
	getLastLoginMethod,
	LAST_LOGIN_LABELS,
	type LastLoginMethod,
} from "~/lib/last-login-method";

type LoginPanelProps = {
	redirectTo: string;
	origin: string;
	providers: AuthProviders;
	googlePortlessWarning?: string;
	oauthErrorMessage?: string;
};

function isMethodAvailable(method: LastLoginMethod, providers: AuthProviders): boolean {
	if (method === "email") {
		return providers.email;
	}
	if (method === "google") {
		return providers.google;
	}
	return providers.github;
}

export function LoginPanel({
	redirectTo,
	origin,
	providers,
	googlePortlessWarning,
	oauthErrorMessage,
}: LoginPanelProps) {
	const callback = authCallbackUrl(redirectTo, origin);
	const loginErrorCallback = authCallbackUrl(
		`/login?redirectTo=${encodeURIComponent(redirectTo)}`,
		origin,
	);
	const [error, setError] = useState<string | null>(oauthErrorMessage ?? null);
	const [busyProvider, setBusyProvider] = useState<"google" | "github" | null>(null);
	const [lastUsed, setLastUsed] = useState<LastLoginMethod | null>(null);

	useEffect(() => {
		setLastUsed(getLastLoginMethod());
	}, []);

	useEffect(() => {
		if (!oauthErrorMessage || typeof window === "undefined") {
			return;
		}
		const params = new URLSearchParams(window.location.search);
		if (!params.has(BETTER_AUTH_OAUTH_ERROR_QUERY)) {
			return;
		}
		params.delete(BETTER_AUTH_OAUTH_ERROR_QUERY);
		params.delete("error_description");
		const q = params.toString();
		const path = window.location.pathname;
		window.history.replaceState(null, "", q ? `${path}?${q}` : path);
	}, [oauthErrorMessage]);

	const lastUsedAvailable =
		lastUsed != null && isMethodAvailable(lastUsed, providers) ? lastUsed : null;

	const onSocialSignIn = useCallback(
		async (provider: "google" | "github") => {
			setError(null);
			setBusyProvider(provider);
			try {
				const result = await signInWithSocial(provider, callback, loginErrorCallback);
				if (!result.success) {
					setError(result.error);
				}
			} finally {
				setBusyProvider(null);
			}
		},
		[loginErrorCallback, callback],
	);

	const showGoogle = providers.google && lastUsedAvailable !== "google";
	const showGithub = providers.github && lastUsedAvailable !== "github";
	const showOtherSocial = showGoogle || showGithub;
	const showOtherEmail = providers.email && lastUsedAvailable !== "email";

	return (
		<div className="max-w-md mx-auto flex flex-col gap-4 p-6 border border-gray-200 dark:border-gray-700 rounded-2xl">
			<h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Sign in</h1>

			{googlePortlessWarning ? (
				<GoogleOAuthPortlessWarning message={googlePortlessWarning} />
			) : null}

			{providers.oauthProxyPassthrough ? <OAuthStagingProxyNotice /> : null}

			{lastUsedAvailable ? (
				<div className="rounded-xl border-2 border-blue-600/50 dark:border-blue-500/40 bg-blue-50/80 dark:bg-blue-950/30 px-4 py-4 flex flex-col gap-3">
					<p className="text-xs font-semibold uppercase tracking-wide text-blue-800 dark:text-blue-300">
						Last used · {LAST_LOGIN_LABELS[lastUsedAvailable]}
					</p>
					{lastUsedAvailable === "google" ? (
						<button
							type="button"
							disabled={busyProvider !== null || Boolean(googlePortlessWarning)}
							className="inline-flex justify-center rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-4 py-2.5 text-sm font-medium disabled:opacity-50"
							onClick={() => onSocialSignIn("google")}
						>
							{busyProvider === "google" ? "Redirecting…" : "Continue with Google"}
						</button>
					) : null}
					{lastUsedAvailable === "github" ? (
						<button
							type="button"
							disabled={busyProvider !== null}
							className="inline-flex justify-center rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-4 py-2.5 text-sm font-medium disabled:opacity-50"
							onClick={() => onSocialSignIn("github")}
						>
							{busyProvider === "github" ? "Redirecting…" : "Continue with GitHub"}
						</button>
					) : null}
					{lastUsedAvailable === "email" ? <EmailAuthForm redirectTo={redirectTo} /> : null}
				</div>
			) : null}

			{showOtherSocial || showOtherEmail ? (
				<>
					{lastUsedAvailable ? (
						<p className="text-center text-xs text-gray-500 dark:text-gray-400">
							Other ways to sign in
						</p>
					) : null}
					{showGoogle ? (
						<button
							type="button"
							disabled={busyProvider !== null || Boolean(googlePortlessWarning)}
							className="inline-flex justify-center rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium disabled:opacity-50"
							onClick={() => onSocialSignIn("google")}
						>
							{busyProvider === "google" ? "Redirecting…" : "Continue with Google"}
						</button>
					) : null}
					{showGithub ? (
						<button
							type="button"
							disabled={busyProvider !== null}
							className="inline-flex justify-center rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium disabled:opacity-50"
							onClick={() => onSocialSignIn("github")}
						>
							{busyProvider === "github" ? "Redirecting…" : "Continue with GitHub"}
						</button>
					) : null}
					{showOtherEmail ? <EmailAuthForm redirectTo={redirectTo} /> : null}
				</>
			) : null}

			{!lastUsedAvailable && !showOtherSocial && !showOtherEmail && providers.email ? (
				<EmailAuthForm redirectTo={redirectTo} />
			) : null}

			{error ? <p className="text-sm text-red-600">{error}</p> : null}

			{!providers.google && !providers.github ? (
				<p className="text-xs text-gray-500">
					OAuth buttons appear when Google or GitHub credentials are configured in{" "}
					<code className="font-mono">.env.local</code>.
				</p>
			) : null}
		</div>
	);
}
