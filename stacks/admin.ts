import alchemy from "alchemy";
import { GitHubSecret, RepositoryEnvironment } from "alchemy/github";

const DEFAULT_GITHUB_ENVIRONMENT = "production";
const ADMIN_APP_ID = "cf-starter-admin";
const ALCHEMY_PASSWORD_SECRET_NAME = "ALCHEMY_PASSWORD";

function runGh(args: readonly string[], hint: string) {
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

function requireEnv(name: string, hint: string) {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`${name} is required. ${hint}`);
	}
	return value;
}

function optionalEnv(name: string) {
	const value = process.env[name]?.trim();
	return value ? value : undefined;
}

function parseGitHubRepository(value: string) {
	const [owner, repository] = value.split("/");
	if (!owner || !repository || value.split("/").length !== 2) {
		throw new Error(`${value} is not a valid GITHUB_REPOSITORY value. Expected owner/repo.`);
	}
	return { owner, repository };
}

function getGitHubTarget() {
	const owner = optionalEnv("GITHUB_OWNER");
	const repository = optionalEnv("GITHUB_REPOSITORY_NAME");
	if (owner && repository) {
		return { owner, repository };
	}

	const githubRepository =
		optionalEnv("GITHUB_REPOSITORY") ??
		runGh(
			["repo", "view", "--json", "owner,name", "--jq", ".owner.login + \"/\" + .name"],
			"Could not infer the GitHub repository. Run `gh auth login` from the repo checkout, or set GITHUB_REPOSITORY=owner/repo.",
		);
	return parseGitHubRepository(githubRepository);
}

function getGitHubToken() {
	return (
		optionalEnv("GITHUB_TOKEN") ??
		runGh(
			["auth", "token"],
			"Could not read a GitHub token. Run `gh auth login` and, if needed, `gh auth refresh -s repo`; or set GITHUB_TOKEN.",
		)
	);
}

const alchemyPassword = requireEnv(
	ALCHEMY_PASSWORD_SECRET_NAME,
	"Use the same value that production deploys use in .env.production and CI.",
);

const githubEnvironment = optionalEnv("GITHUB_ENVIRONMENT") ?? DEFAULT_GITHUB_ENVIRONMENT;
const githubToken = getGitHubToken();
const { owner, repository } = getGitHubTarget();

const app = await alchemy(ADMIN_APP_ID);

await RepositoryEnvironment("github-actions-environment", {
	owner,
	repository,
	name: githubEnvironment,
});

await GitHubSecret("github-actions-alchemy-password", {
	owner,
	repository,
	name: ALCHEMY_PASSWORD_SECRET_NAME,
	value: alchemy.secret(alchemyPassword),
	environment: githubEnvironment,
	token: alchemy.secret(githubToken),
});

console.log({
	app: ADMIN_APP_ID,
	repository: `${owner}/${repository}`,
	environment: githubEnvironment,
	secret: ALCHEMY_PASSWORD_SECRET_NAME,
});

await app.finalize();
