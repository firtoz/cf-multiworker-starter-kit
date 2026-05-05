/**
 * GitHub Actions environment **Variables** (plaintext) via REST — **`GitHubEnvironmentVariable`** resources share one
 * in-process prefetch map per `(owner, repo, environment, resolved token)`.
 *
 * Adapted from a sibling-project pattern (`listEnvironmentVariables` + shared cache + create/update paths); provider id **`multiworker::GitHubEnvironmentVariable`** ([Alchemy resources](https://alchemy.run/concepts/resource/)).
 */

import { spawnSync } from "node:child_process";
import { Octokit } from "@octokit/rest";
import type { Context } from "alchemy";
import { Resource } from "alchemy";

type OctokitClient = InstanceType<typeof Octokit>;

export interface GitHubEnvironmentVariableProps {
	owner: string;
	repository: string;
	environment: string;
	name: string;
	value: string;
	/** Defaults: `GITHUB_ACCESS_TOKEN`, `GITHUB_TOKEN`, then `gh auth token`. */
	token?: string;
}

export interface GitHubEnvironmentVariableOutput
	extends Omit<GitHubEnvironmentVariableProps, "token"> {
	id: string;
	updatedAt: string;
}

function readGhAuthTokenSync(): string | undefined {
	const proc = spawnSync("gh", ["auth", "token"], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (proc.error != null || proc.status !== 0) {
		return undefined;
	}
	const t = proc.stdout?.trim();
	return t ? t : undefined;
}

async function getGitHubToken(explicit?: string): Promise<string> {
	const trimmed = explicit?.trim();
	if (trimmed) {
		return trimmed;
	}
	const fromEnv = process.env["GITHUB_ACCESS_TOKEN"]?.trim() || process.env["GITHUB_TOKEN"]?.trim();
	if (fromEnv) {
		return fromEnv;
	}
	const fromGh = readGhAuthTokenSync();
	if (fromGh) {
		return fromGh;
	}
	throw new Error(
		"Could not resolve GitHub token for environment variables. Set GITHUB_TOKEN or run `gh auth login`.",
	);
}

async function verifyRepoAccess(
	octokit: OctokitClient,
	owner: string,
	repo: string,
): Promise<void> {
	try {
		await octokit.rest.repos.get({ owner, repo });
	} catch (error: unknown) {
		const err = error as { status?: number };
		if (err.status === 401) {
			throw new Error("GitHub authentication failed (check GITHUB_TOKEN or `gh auth login`).");
		}
		if (err.status === 403) {
			throw new Error(
				"Insufficient GitHub permissions to manage environment variables on this repository.",
			);
		}
		if (err.status === 404) {
			throw new Error(`GitHub repository not found: ${owner}/${repo}`);
		}
		throw error;
	}
}

/** One paginated scan of existing variables (no per-name GET). */
async function prefetchEnvironmentVariablesMap(props: {
	owner: string;
	repository: string;
	environment: string;
	token?: string;
}): Promise<Map<string, string>> {
	const token = await getGitHubToken(props.token);
	const octokit = new Octokit({ auth: token });
	const map = new Map<string, string>();
	let page = 1;
	const perPage = 30;
	while (true) {
		const { data } = await octokit.rest.actions.listEnvironmentVariables({
			owner: props.owner,
			repo: props.repository,
			environment_name: props.environment,
			per_page: perPage,
			page,
		});
		const vars = data.variables ?? [];
		for (const row of vars) {
			map.set(row.name, row.value ?? "");
		}
		if (vars.length < perPage) {
			break;
		}
		page++;
	}
	return map;
}

/** Coalesces duplicate list calls when many `GitHubEnvironmentVariable` resources share one target. */
const variablesListCacheByTarget = new Map<string, Promise<Map<string, string>>>();

function variablesListCacheKey(
	owner: string,
	repository: string,
	environment: string,
	resolvedToken: string,
): string {
	return `${owner}\0${repository}\0${environment}\0${resolvedToken}`;
}

async function sharedVariablesMapForTarget(props: {
	owner: string;
	repository: string;
	environment: string;
	token?: string;
}): Promise<Map<string, string>> {
	const resolvedToken = await getGitHubToken(props.token);
	const key = variablesListCacheKey(
		props.owner,
		props.repository,
		props.environment,
		resolvedToken,
	);
	let inflight = variablesListCacheByTarget.get(key);
	if (!inflight) {
		inflight = prefetchEnvironmentVariablesMap({
			owner: props.owner,
			repository: props.repository,
			environment: props.environment,
			token: resolvedToken,
		});
		variablesListCacheByTarget.set(key, inflight);
	}
	return inflight;
}

async function upsertEnvironmentVariableFromCache(
	octokit: OctokitClient,
	props: {
		owner: string;
		repository: string;
		environment: string;
		name: string;
		value: string;
	},
	variableSyncCache: Map<string, string>,
): Promise<void> {
	const { owner, repository, environment, name, value } = props;
	const existing = variableSyncCache.get(name);
	if (existing === value) {
		return;
	}
	if (existing === undefined) {
		await octokit.rest.actions.createEnvironmentVariable({
			owner,
			repo: repository,
			environment_name: environment,
			name,
			value,
		});
		variableSyncCache.set(name, value);
		return;
	}
	await octokit.rest.actions.updateEnvironmentVariable({
		owner,
		repo: repository,
		environment_name: environment,
		name,
		value,
	});
	variableSyncCache.set(name, value);
}

export const GitHubEnvironmentVariable = Resource(
	"multiworker::GitHubEnvironmentVariable",
	async function (
		this: Context<GitHubEnvironmentVariableOutput>,
		_id: string,
		props: GitHubEnvironmentVariableProps,
	): Promise<GitHubEnvironmentVariableOutput> {
		const token = await getGitHubToken(props.token);
		const octokit = new Octokit({ auth: token });

		if (!this.quiet) {
			await verifyRepoAccess(octokit, props.owner, props.repository);
		}

		if (this.phase === "delete") {
			if (this.output?.id) {
				try {
					await octokit.rest.actions.deleteEnvironmentVariable({
						owner: props.owner,
						repo: props.repository,
						environment_name: props.environment,
						name: props.name,
					});
				} catch (error: unknown) {
					const err = error as { status?: number };
					if (err.status !== 404) {
						throw error;
					}
				}
			}
			return this.destroy();
		}

		const variableSyncCache = await sharedVariablesMapForTarget({
			owner: props.owner,
			repository: props.repository,
			environment: props.environment,
			...(props.token ? { token: props.token } : {}),
		});

		await upsertEnvironmentVariableFromCache(
			octokit,
			{
				owner: props.owner,
				repository: props.repository,
				environment: props.environment,
				name: props.name,
				value: props.value,
			},
			variableSyncCache,
		);

		const id = [props.owner, props.repository, props.environment, props.name].join("/");

		return {
			id,
			owner: props.owner,
			repository: props.repository,
			environment: props.environment,
			name: props.name,
			value: props.value,
			updatedAt: new Date().toISOString(),
		};
	},
);
