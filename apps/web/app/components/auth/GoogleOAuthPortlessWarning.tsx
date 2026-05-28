type GoogleOAuthPortlessWarningProps = {
	message: string;
};

export function GoogleOAuthPortlessWarning({ message }: GoogleOAuthPortlessWarningProps) {
	return (
		<div
			role="alert"
			className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-3 py-3 text-sm text-red-900 dark:text-red-200"
		>
			<p className="font-semibold">Google sign-in unavailable in this local setup</p>
			<p className="mt-1 text-red-800 dark:text-red-300">{message}</p>
		</div>
	);
}
