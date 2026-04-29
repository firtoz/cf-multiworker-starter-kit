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

function missingRequiredEnvMessage(
	name: string,
	description?: string,
	scope?: AlchemyScopeHint,
) {
	const prefix = description ? `${name} is not set. ${description}. ` : `${name} is not set. `;
	if (scope?.phase === "destroy") {
		return (
			prefix +
			"For destroy, set it the same as deploy: repo-root .env.production (e.g. `bun run setup:prod`) " +
			"or export it. This repo uses: bun --env-file ../../.env.production alchemy destroy …"
		);
	}
	if (scope?.local || scope?.stage === "local") {
		return (
			prefix +
			`For local dev, run \`bun run setup\` to seed .env.local, or export ${name}. ` +
			"Dev uses: bun --env-file ../../.env.local alchemy dev …"
		);
	}
	if (scope?.stage === "prod") {
		return (
			prefix +
			"For deploy, run `bun run setup:prod` at the repository root to seed " +
			`repo-root .env.production, or add ${name} there / in CI. Deploy uses: ` +
			"bun --env-file ../../.env.production alchemy deploy …"
		);
	}

	const argv = process.argv;
	if (argv.includes("destroy")) {
		return (
			prefix +
			"For alchemy destroy, set it in repo-root .env.production (bun run setup:prod) " +
			"or in the environment. This repo’s destroy script uses: bun --env-file ../../.env.production alchemy destroy …"
		);
	}
	if (argv.includes("deploy")) {
		return (
			prefix +
			"For alchemy deploy, set it in repo-root .env.production (bun run setup:prod) " +
			"or in the environment. This repo’s deploy script uses: bun --env-file ../../.env.production alchemy deploy …"
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
		"Dev: .env.local (bun run setup). Deploy/destroy: .env.production (bun run setup:prod) or " +
		"export the variable (CI)."
	);
}

export function requireEnv(
	name: string,
	description?: string,
	scope?: AlchemyScopeHint,
): string {
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
