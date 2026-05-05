/**
 * Required whenever the Alchemy app uses `alchemy.secret()` — encrypts secrets in Alchemy state.
 * Set `ALCHEMY_PASSWORD` in repo-root **`.env.local`** (dev) or **`.env.production`** (deploy / CI), or your secret store in CI.
 * Package scripts keep local/prod state files separate with `--stage local` and `--stage prod`, so local and prod passwords do not need to match.
 * For a given shared stage (especially prod), every deploy runner must use the same password.
 *
 * @see https://alchemy.run/concepts/secret/#encryption-password
 */

interface AlchemyScopeHint {
	readonly phase: "up" | "destroy" | "read";
	readonly local: boolean;
	readonly stage: string;
}

function missingRequiredEnvMessage(name: string, description?: string, scope?: AlchemyScopeHint) {
	const prefix = description ? `${name} is not set. ${description}. ` : `${name} is not set. `;
	if (scope?.phase === "destroy") {
		return (
			prefix +
			"For destroy, set it the same as deploy: .env.production for STAGE=prod, .env.staging for staging/pr-* " +
			"(e.g. `bun run setup:prod` / `bun run setup:staging`) or export it. Destroy scripts mirror deploy env files."
		);
	}
	if (scope?.local || scope?.stage === "local") {
		return (
			prefix +
			`For local dev, run \`bun run setup\` to seed .env.local, or export ${name}. ` +
			"Dev runs: `alchemy-cli --stage local dev` from the package (loads repo-root `.env.local`)."
		);
	}
	if (scope?.stage === "prod") {
		return (
			prefix +
			"For production deploy, run `bun run setup:prod` at the repository root to seed " +
			`repo-root .env.production (STAGE=prod), or add ${name} in CI secrets. ` +
			"Deploy scripts use: `alchemy-cli --stage prod deploy` from each package."
		);
	}
	if (scope?.stage === "staging" || scope?.stage?.startsWith("pr-")) {
		return (
			prefix +
			"For staging/preview deploy, run `bun run setup:staging` and use repo-root .env.staging " +
			"(STAGE=staging or STAGE=pr-<n>), or set secrets on the GitHub **staging** environment. " +
			"Deploy scripts use: `alchemy-cli --stage staging deploy` (preview: `--stage preview` needs `STAGE=pr-<n>` already)."
		);
	}

	const argv = process.argv;
	if (argv.includes("destroy")) {
		return (
			prefix +
			"For alchemy destroy, set ALCHEMY_PASSWORD in the same repo-root file as deploy " +
			"(.env.production for prod, .env.staging for staging/preview) or in the environment."
		);
	}
	if (argv.includes("deploy")) {
		return (
			prefix +
			"For alchemy deploy, use .env.production with STAGE=prod or .env.staging with STAGE=staging/pr-* " +
			"(see `bun run setup:prod` / `bun run setup:staging`) or set variables in CI."
		);
	}
	if (argv.includes("dev")) {
		return (
			prefix +
			"For alchemy dev, set it in repo-root .env.local (bun run setup) or the environment. " +
			"This repo’s dev script uses: bun --env-file ../../.env.local alchemy dev …"
		);
	}
	return (
		prefix +
		"Staging/preview: .env.staging (`bun run setup:staging`). Production: .env.production (`bun run setup:prod`). " +
		"Export the variable or use GitHub Environment secrets when running in Actions."
	);
}

export function requireEnv(name: string, description?: string, scope?: AlchemyScopeHint): string {
	const raw = process.env[name];
	if (raw == null || raw === "") {
		throw new Error(missingRequiredEnvMessage(name, description, scope));
	}
	return raw;
}

export function requireAlchemyPassword(
	scope: AlchemyScopeHint & { readonly password: string | undefined },
) {
	if (scope.password == null || scope.password === "") {
		throw new Error(
			missingRequiredEnvMessage("ALCHEMY_PASSWORD", "Encrypts Alchemy state and secrets", scope),
		);
	}
}
