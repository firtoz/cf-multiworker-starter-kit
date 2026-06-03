type OAuthStagingProxyNoticeProps = {
	className?: string;
};

export function OAuthStagingProxyNotice({ className }: OAuthStagingProxyNoticeProps) {
	return (
		<p
			className={
				className ??
				"text-xs text-gray-600 dark:text-gray-400 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-3 py-2"
			}
		>
			Google and GitHub on this preview (sign-in, sign-up, guest upgrade, connect on account) route
			through the staging OAuth callback, then return here. Email/password auth stays on this
			preview. The staging stack must be deployed.
		</p>
	);
}
