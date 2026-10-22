"use strict";

/**
 * Best-effort teardown of GitHub Deployment metadata for a closed PR preview.
 *
 * Marks matching deployments inactive. Deletes legacy `preview-pr-<n>` Environments only
 * when the token allows — default `GITHUB_TOKEN` cannot delete Environments
 * ("Resource not accessible by integration"). New previews use the shared `preview`
 * Environment (see pr-deploy.yml) so nothing needs deleting after inactivation.
 *
 * Optional secret `PREVIEW_ENV_ADMIN_TOKEN` (classic PAT with `repo`, or App token with
 * Environments write) enables legacy environment deletion.
 *
 * @param {{
 *   github: {
 *     paginate: Function,
 *     rest: {
 *       repos: {
 *         listDeployments: Function,
 *         createDeploymentStatus: Function,
 *         deleteAnEnvironment: Function,
 *       },
 *     },
 *   },
 *   context: { repo: { owner: string, repo: string } },
 *   core: { info: Function, warning: Function, setOutput: Function, setFailed: Function },
 * }} ctx
 */

/** Shared GitHub Environment name for all PR preview Deployments (GITHUB_TOKEN-safe). */
const SHARED_PREVIEW_ENVIRONMENT = "preview";

function legacyPreviewEnvironmentName(prNumber) {
	return `preview-pr-${prNumber}`;
}

function parsePayload(payload) {
	if (payload == null) {
		return null;
	}
	if (typeof payload === "object") {
		return payload;
	}
	if (typeof payload === "string") {
		try {
			return JSON.parse(payload);
		} catch {
			return null;
		}
	}
	return null;
}

/** Whether a deployment row belongs to this PR preview. */
function deploymentMatchesPr(deployment, prNumber) {
	const n = Number(prNumber);
	if (!Number.isInteger(n) || n <= 0) {
		return false;
	}
	if (deployment?.environment === legacyPreviewEnvironmentName(n)) {
		return true;
	}
	const payload = parsePayload(deployment?.payload);
	if (payload != null && Number(payload.pr_number) === n) {
		return true;
	}
	const description = deployment?.description;
	if (typeof description === "string") {
		if (description === `PR ${n} preview` || description.startsWith(`PR ${n} `)) {
			return true;
		}
	}
	return false;
}

function isEnvironmentDeletePermissionError(error) {
	const msg = String(error);
	const lower = msg.toLowerCase();
	return (
		lower.includes("resource not accessible by integration") ||
		lower.includes("httperror: resource not accessible") ||
		/\b403\b/.test(msg) ||
		lower.includes("forbidden")
	);
}

module.exports = async function cleanupGithubPreviewEnv(ctx) {
	const { github, context, core } = ctx;
	const owner = context.repo.owner;
	const repo = context.repo.repo;
	const prNumber = Number(process.env.PR_NUMBER);
	if (!Number.isInteger(prNumber) || prNumber <= 0) {
		core.warning("cleanup-github-preview-env: invalid PR_NUMBER");
		core.setOutput("outcome", "skipped");
		return;
	}

	const legacyEnvironment = legacyPreviewEnvironmentName(prNumber);
	let inactivated = 0;
	let statusErrors = 0;

	const environmentNames = [legacyEnvironment, SHARED_PREVIEW_ENVIRONMENT];
	const seenDeploymentIds = new Set();

	try {
		for (const environment of environmentNames) {
			const deployments = await github.paginate(github.rest.repos.listDeployments, {
				owner,
				repo,
				environment,
				per_page: 100,
			});
			const matching = deployments.filter((d) => {
				const id = d?.id;
				if (id == null || seenDeploymentIds.has(String(id))) {
					return false;
				}
				return deploymentMatchesPr(d, prNumber);
			});
			core.info(
				`cleanup-github-preview-env: ${matching.length}/${deployments.length} deployment(s) for ${environment} match PR ${prNumber}`,
			);
			for (const deployment of matching) {
				const id = deployment.id;
				seenDeploymentIds.add(String(id));
				try {
					await github.rest.repos.createDeploymentStatus({
						owner,
						repo,
						deployment_id: id,
						state: "inactive",
						description: "Preview stack destroyed",
						auto_inactive: false,
					});
					inactivated += 1;
				} catch (error) {
					statusErrors += 1;
					core.warning(
						`cleanup-github-preview-env: inactive status failed for deployment ${id}: ${String(error)}`,
					);
				}
			}
		}
	} catch (error) {
		core.warning(`cleanup-github-preview-env: list deployments failed: ${String(error)}`);
		core.setOutput("outcome", "failure");
		core.setOutput("inactivated", String(inactivated));
		core.setOutput("environment_deleted", "false");
		core.setFailed(`cleanup-github-preview-env: list deployments failed: ${String(error)}`);
		return;
	}

	let environmentDeleted = false;
	let environmentDeleteSkippedExpected = false;
	try {
		await github.rest.repos.deleteAnEnvironment({
			owner,
			repo,
			environment_name: legacyEnvironment,
		});
		environmentDeleted = true;
		core.info(`cleanup-github-preview-env: deleted legacy environment ${legacyEnvironment}`);
	} catch (error) {
		const msg = String(error);
		if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
			core.info(
				`cleanup-github-preview-env: legacy environment ${legacyEnvironment} already absent (ok)`,
			);
			environmentDeleted = true;
		} else if (isEnvironmentDeletePermissionError(error)) {
			// Expected with default GITHUB_TOKEN. Shared `preview` env is never deleted.
			environmentDeleteSkippedExpected = true;
			core.info(
				`cleanup-github-preview-env: left ${legacyEnvironment} in place — default GITHUB_TOKEN cannot delete Environments. Deployments inactivated=${inactivated}. Optional: set secret PREVIEW_ENV_ADMIN_TOKEN (repo-scoped PAT) or delete leftover preview-pr-* via \`bun run preview:cleanup:orphans -- --apply\` / repo Settings → Environments.`,
			);
		} else {
			core.warning(
				`cleanup-github-preview-env: could not delete environment ${legacyEnvironment}: ${msg}`,
			);
		}
	}

	const outcome = statusErrors > 0 ? "failure" : "success";
	core.setOutput("outcome", outcome);
	core.setOutput("inactivated", String(inactivated));
	core.setOutput("environment_deleted", environmentDeleted ? "true" : "false");
	core.setOutput(
		"environment_delete_skipped_expected",
		environmentDeleteSkippedExpected ? "true" : "false",
	);
	if (outcome === "failure") {
		core.setFailed(
			`cleanup-github-preview-env: ${statusErrors} deployment status error(s) for PR ${prNumber}`,
		);
	}
};

module.exports.SHARED_PREVIEW_ENVIRONMENT = SHARED_PREVIEW_ENVIRONMENT;
module.exports.deploymentMatchesPr = deploymentMatchesPr;
module.exports.isEnvironmentDeletePermissionError = isEnvironmentDeletePermissionError;
