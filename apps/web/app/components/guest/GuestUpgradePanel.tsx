import { type AuthProviders, type AuthUser, accountDisplayName } from "@internal/auth-client";
import { SIGNED_IN_SESSION_DAYS } from "@internal/auth-db/constants";
import { type ComponentProps, useCallback, useEffect, useState } from "react";
import { href } from "react-router";
import { GoogleOAuthPortlessWarning } from "~/components/auth/GoogleOAuthPortlessWarning";
import { OAuthStagingProxyNotice } from "~/components/auth/OAuthStagingProxyNotice";
import { authCallbackUrl } from "~/lib/auth-callback-url";
import { linkSocialProvider } from "~/lib/auth-email-client";
import { BETTER_AUTH_OAUTH_ERROR_QUERY } from "~/lib/auth-link-error";
import { upgradeGuestWithEmail } from "~/lib/guest-upgrade-client";

type GuestUpgradePanelProps = {
	user: AuthUser;
	redirectTo: string;
	providers: AuthProviders;
	googlePortlessWarning?: string;
	linkErrorMessage?: string;
};

export function GuestUpgradePanel({
	user,
	redirectTo,
	providers,
	googlePortlessWarning,
	linkErrorMessage,
}: GuestUpgradePanelProps) {
	const callback = authCallbackUrl(redirectTo);
	const upgradeErrorCallback = authCallbackUrl(
		`${href("/guest/upgrade")}?redirectTo=${encodeURIComponent(redirectTo)}`,
	);
	const displayName = accountDisplayName(user) ?? "Guest";
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState<"email" | "google" | "github" | null>(null);

	useEffect(() => {
		if (!linkErrorMessage || typeof window === "undefined") {
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

	const onEmailSubmit = useCallback<NonNullable<ComponentProps<"form">["onSubmit"]>>(
		async (e) => {
			e.preventDefault();
			setError(null);
			if (password !== confirmPassword) {
				setError("Passwords do not match");
				return;
			}
			setBusy("email");
			try {
				const result = await upgradeGuestWithEmail(email, password, callback);
				if (!result.success) {
					setError(result.error);
				}
			} finally {
				setBusy(null);
			}
		},
		[email, password, confirmPassword, callback],
	);

	const onOAuthLink = useCallback(
		async (provider: "google" | "github") => {
			setError(null);
			setBusy(provider);
			try {
				const result = await linkSocialProvider(provider, callback, upgradeErrorCallback);
				if (!result.success) {
					setError(result.error);
				}
			} finally {
				setBusy(null);
			}
		},
		[callback, upgradeErrorCallback],
	);

	const showOAuth = providers.google || providers.github;

	return (
		<div className="max-w-lg mx-auto flex flex-col gap-6">
			<div className="relative overflow-hidden rounded-2xl border border-sky-200/80 dark:border-sky-800/60 bg-linear-to-br from-sky-50 via-white to-indigo-50/80 dark:from-sky-950/50 dark:via-gray-950 dark:to-indigo-950/30 p-6 sm:p-8 shadow-sm">
				<div
					className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-sky-300/30 dark:bg-sky-500/10 blur-3xl"
					aria-hidden
				/>
				<div
					className="pointer-events-none absolute -bottom-20 -left-10 h-36 w-36 rounded-full bg-indigo-300/25 dark:bg-indigo-500/10 blur-3xl"
					aria-hidden
				/>
				<div className="relative flex flex-col gap-3">
					<p className="text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">
						Guest session
					</p>
					<h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-50 tracking-tight">
						Create your account
					</h1>
					<p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 leading-relaxed">
						Keep chatting as{" "}
						<span className="font-medium text-gray-800 dark:text-gray-100">{displayName}</span> —
						your messages and name stay on this account. You&apos;re just adding a permanent way to
						sign back in.
					</p>
					<ul className="mt-1 grid gap-2 text-sm text-gray-700 dark:text-gray-300">
						<li className="flex items-start gap-2">
							<span className="mt-0.5 text-sky-600 dark:text-sky-400" aria-hidden>
								✓
							</span>
							Same chat history — nothing is copied or lost
						</li>
						<li className="flex items-start gap-2">
							<span className="mt-0.5 text-sky-600 dark:text-sky-400" aria-hidden>
								✓
							</span>
							{SIGNED_IN_SESSION_DAYS}-day signed-in sessions (extended on each visit)
						</li>
						<li className="flex items-start gap-2">
							<span className="mt-0.5 text-sky-600 dark:text-sky-400" aria-hidden>
								✓
							</span>
							Manage sign-in methods on your account page afterward
						</li>
					</ul>
				</div>
			</div>

			{googlePortlessWarning ? (
				<GoogleOAuthPortlessWarning message={googlePortlessWarning} />
			) : null}

			{providers.oauthProxyPassthrough ? <OAuthStagingProxyNotice /> : null}

			{linkErrorMessage ? (
				<p
					className="text-sm text-red-700 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 px-4 py-3"
					role="alert"
				>
					{linkErrorMessage}
				</p>
			) : null}

			{showOAuth ? (
				<section className="flex flex-col gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/40 p-5 sm:p-6">
					<h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Quick connect</h2>
					<p className="text-sm text-gray-600 dark:text-gray-400">
						Link Google or GitHub to this guest profile — no new account is created.
					</p>
					<div className="flex flex-col sm:flex-row gap-2">
						{providers.google ? (
							<button
								type="button"
								disabled={busy !== null || Boolean(googlePortlessWarning)}
								className="flex-1 inline-flex justify-center rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-4 py-2.5 text-sm font-medium disabled:opacity-50 transition-opacity"
								onClick={() => onOAuthLink("google")}
							>
								{busy === "google" ? "Redirecting…" : "Continue with Google"}
							</button>
						) : null}
						{providers.github ? (
							<button
								type="button"
								disabled={busy !== null}
								className="flex-1 inline-flex justify-center rounded-xl border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-medium disabled:opacity-50 transition-opacity"
								onClick={() => onOAuthLink("github")}
							>
								{busy === "github" ? "Redirecting…" : "Continue with GitHub"}
							</button>
						) : null}
					</div>
				</section>
			) : null}

			{providers.email ? (
				<section className="flex flex-col gap-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/40 p-5 sm:p-6">
					<div>
						<h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
							Email & password
						</h2>
						<p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
							Add login credentials to your current guest profile.
						</p>
					</div>
					<form className="flex flex-col gap-3" onSubmit={onEmailSubmit}>
						<label className="flex flex-col gap-1 text-sm">
							<span className="text-gray-700 dark:text-gray-300">Email</span>
							<input
								type="email"
								className="border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 bg-white dark:bg-gray-900"
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
								className="border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 bg-white dark:bg-gray-900"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								autoComplete="new-password"
								required
								minLength={8}
							/>
						</label>
						<label className="flex flex-col gap-1 text-sm">
							<span className="text-gray-700 dark:text-gray-300">Confirm password</span>
							<input
								type="password"
								className="border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 bg-white dark:bg-gray-900"
								value={confirmPassword}
								onChange={(e) => setConfirmPassword(e.target.value)}
								autoComplete="new-password"
								required
								minLength={8}
							/>
						</label>
						{error ? (
							<p className="text-sm text-red-600 dark:text-red-400" role="alert">
								{error}
							</p>
						) : null}
						<button
							type="submit"
							disabled={busy !== null}
							className="rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-medium px-4 py-2.5 text-sm transition-colors"
						>
							{busy === "email" ? "Creating account…" : "Create account with email"}
						</button>
					</form>
				</section>
			) : null}
		</div>
	);
}
