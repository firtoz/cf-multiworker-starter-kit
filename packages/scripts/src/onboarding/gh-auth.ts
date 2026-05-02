/**
 * Require an authenticated GitHub CLI for onboarding / sync scripts.
 */
export function assertGhAuthenticated(repoRoot: string): void {
	const r = Bun.spawnSync(["gh", "auth", "status"], {
		cwd: repoRoot,
		stdout: "pipe",
		stderr: "pipe",
	});
	if (r.exitCode === 0) {
		return;
	}
	console.error("GitHub CLI is not authenticated, or `gh` is not installed.");
	console.error("");
	console.error(
		"Needed for: `github:sync:*` (GitHub Environment secrets, variables, and repo policy).",
	);
	console.error("");
	console.error("Next step: gh auth login");
	console.error("Then rerun this command.");
	process.exit(1);
}
