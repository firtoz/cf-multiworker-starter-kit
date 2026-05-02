/**
 * Shared GitHub repo + token resolution for admin stacks (`stacks/admin.ts`, `stacks/github-environment-only.ts`).
 * Uses `gh` when env vars are not set.
 */
function runGh(args: readonly string[], hint: string): string {
	const proc = Bun.spawnSync(["gh", ...args], {
		stderr: "pipe",
		stdout: "pipe",
	});
	if (!proc.success) {
		const stderr = proc.stderr.toString().trim();
		throw new Error(`${hint}${stderr ? `\n\nGitHub CLI said:\n${stderr}` : ""}`);
	}
	const value = proc.stdout.toString().trim();
	if (!value) {
		throw new Error(hint);
	}
	return value;
}

function optionalEnv(name: string): string | undefined {
	const value = process.env[name]?.trim();
	return value ? value : undefined;
}

export function parseGitHubRepository(value: string): { owner: string; repository: string } {
	const [owner, repository] = value.split("/");
	if (!owner || !repository || value.split("/").length !== 2) {
		throw new Error(`${value} is not a valid GITHUB_REPOSITORY value. Expected owner/repo.`);
	}
	return { owner, repository };
}

export function getGitHubTarget(): { owner: string; repository: string } {
	const owner = optionalEnv("GITHUB_OWNER");
	const repository = optionalEnv("GITHUB_REPOSITORY_NAME");
	if (owner && repository) {
		return { owner, repository };
	}

	const githubRepository =
		optionalEnv("GITHUB_REPOSITORY") ??
		runGh(
			["repo", "view", "--json", "owner,name", "--jq", '.owner.login + "/" + .name'],
			"Could not infer the GitHub repository. Run `gh auth login` from the repo checkout, or set GITHUB_REPOSITORY=owner/repo.",
		);
	return parseGitHubRepository(githubRepository);
}

export function getGitHubToken(): string {
	return (
		optionalEnv("GITHUB_TOKEN") ??
		runGh(
			["auth", "token"],
			"Could not read a GitHub token. Run `gh auth login` and, if needed, `gh auth refresh -s repo`; or set GITHUB_TOKEN.",
		)
	);
}

/** Maps `STAGE` from dotenv-cli for `github:sync:*` / `github:env:*` to the GitHub Actions environment name. */
export function githubActionsEnvironmentFromAlchemyStage(stage: string): "production" | "staging" {
	const s = stage.trim().toLowerCase();
	if (s === "prod" || s === "production") {
		return "production";
	}
	if (s === "staging") {
		return "staging";
	}
	throw new Error(
		`GitHub admin stacks: STAGE must be "prod" or "staging" (got ${JSON.stringify(stage)}). PR preview uses the staging environment in CI — do not run admin sync for pr-*.`,
	);
}
