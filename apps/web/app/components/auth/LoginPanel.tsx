import type { AuthProviders } from "@internal/auth-client";
import { useCallback, useState } from "react";
import { EmailAuthForm } from "~/components/auth/EmailAuthForm";
import { signInWithSocial } from "~/lib/auth-email-client";

type LoginPanelProps = {
	redirectTo: string;
	providers: AuthProviders;
};

function authCallbackUrl(redirectTo: string): string {
	return `${window.location.origin}${redirectTo.startsWith("/") ? redirectTo : `/${redirectTo}`}`;
}

export function LoginPanel({ redirectTo, providers }: LoginPanelProps) {
	const callback = authCallbackUrl(redirectTo);
	const hasSocial = providers.google || providers.github;
	const [error, setError] = useState<string | null>(null);
	const [busyProvider, setBusyProvider] = useState<"google" | "github" | null>(null);

	const onSocialSignIn = useCallback(
		async (provider: "google" | "github") => {
			setError(null);
			setBusyProvider(provider);
			try {
				const result = await signInWithSocial(provider, callback);
				if (!result.ok) {
					setError(result.message);
				}
			} finally {
				setBusyProvider(null);
			}
		},
		[callback],
	);

	return (
		<div className="max-w-md mx-auto flex flex-col gap-4 p-6 border border-gray-200 dark:border-gray-700 rounded-2xl">
			<h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Sign in</h1>
			<p className="text-sm text-gray-600 dark:text-gray-400">
				Email and OAuth use this site&apos;s <code className="font-mono text-xs">/api/auth/*</code>{" "}
				routes (proxied to the auth worker). After sign-in you return to the page you requested.
			</p>
			{providers.google && (
				<button
					type="button"
					disabled={busyProvider !== null}
					className="inline-flex justify-center rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-4 py-2 text-sm font-medium disabled:opacity-50"
					onClick={() => onSocialSignIn("google")}
				>
					{busyProvider === "google" ? "Redirecting…" : "Continue with Google"}
				</button>
			)}
			{providers.github && (
				<button
					type="button"
					disabled={busyProvider !== null}
					className="inline-flex justify-center rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium disabled:opacity-50"
					onClick={() => onSocialSignIn("github")}
				>
					{busyProvider === "github" ? "Redirecting…" : "Continue with GitHub"}
				</button>
			)}
			{error && <p className="text-sm text-red-600">{error}</p>}
			{providers.email && <EmailAuthForm redirectTo={redirectTo} />}
			{!hasSocial && (
				<p className="text-xs text-gray-500">
					OAuth buttons appear when <code className="font-mono">GOOGLE_*</code> or{" "}
					<code className="font-mono">GITHUB_*</code> are set in repo-root{" "}
					<code className="font-mono">.env.local</code> (optional for local dev).
				</p>
			)}
		</div>
	);
}
