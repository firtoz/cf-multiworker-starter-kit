import type { AuthProviders } from "@internal/auth-client";
import { EmailAuthForm } from "~/components/auth/EmailAuthForm";

type LoginPanelProps = {
	redirectTo: string;
	providers: AuthProviders;
};

function authCallbackUrl(redirectTo: string): string {
	return `${window.location.origin}${redirectTo.startsWith("/") ? redirectTo : `/${redirectTo}`}`;
}

export function LoginPanel({ redirectTo, providers }: LoginPanelProps) {
	const callback = authCallbackUrl(redirectTo);

	const googleHref = `/api/auth/sign-in/social?provider=google&callbackURL=${encodeURIComponent(callback)}`;
	const githubHref = `/api/auth/sign-in/social?provider=github&callbackURL=${encodeURIComponent(callback)}`;
	const hasSocial = providers.google || providers.github;

	return (
		<div className="max-w-md mx-auto flex flex-col gap-4 p-6 border border-gray-200 dark:border-gray-700 rounded-2xl">
			<h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Sign in</h1>
			<p className="text-sm text-gray-600 dark:text-gray-400">
				Email and OAuth use this site&apos;s <code className="font-mono text-xs">/api/auth/*</code>{" "}
				routes (proxied to the auth worker). After sign-in you return to the page you requested.
			</p>
			{providers.google && (
				<a
					className="inline-flex justify-center rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-4 py-2 text-sm font-medium"
					href={googleHref}
				>
					Continue with Google
				</a>
			)}
			{providers.github && (
				<a
					className="inline-flex justify-center rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium"
					href={githubHref}
				>
					Continue with GitHub
				</a>
			)}
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
