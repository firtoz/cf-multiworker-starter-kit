"use strict";

/**
 * Best-effort teardown of GitHub Deployment metadata for a closed PR preview.
 * Marks all deployments for `preview-pr-<n>` inactive, then deletes the Environment
 * when the token allows (soft-fail on permission errors).
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
 *   core: { info: Function, warning: Function, setOutput: Function },
 * }} ctx
 */
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

	const environment = `preview-pr-${prNumber}`;
	let inactivated = 0;
	let statusErrors = 0;

	try {
		const deployments = await github.paginate(github.rest.repos.listDeployments, {
			owner,
			repo,
			environment,
			per_page: 100,
		});
		core.info(
			`cleanup-github-preview-env: ${deployments.length} deployment(s) for ${environment}`,
		);
		for (const deployment of deployments) {
			const id = deployment?.id;
			if (id == null) {
				continue;
			}
			try {
				await github.rest.repos.createDeploymentStatus({
					owner,
					repo,
					deployment_id: id,
					state: "inactive",
					description: "Preview stack destroyed",
				});
				inactivated += 1;
			} catch (error) {
				statusErrors += 1;
				core.warning(
					`cleanup-github-preview-env: inactive status failed for deployment ${id}: ${String(error)}`,
				);
			}
		}
	} catch (error) {
		core.warning(`cleanup-github-preview-env: list deployments failed: ${String(error)}`);
		core.setOutput("outcome", "failure");
		core.setOutput("inactivated", String(inactivated));
		core.setOutput("environment_deleted", "false");
		return;
	}

	let environmentDeleted = false;
	try {
		await github.rest.repos.deleteAnEnvironment({
			owner,
			repo,
			environment_name: environment,
		});
		environmentDeleted = true;
		core.info(`cleanup-github-preview-env: deleted environment ${environment}`);
	} catch (error) {
		const msg = String(error);
		// Soft-fail: GITHUB_TOKEN often lacks admin to delete Environments.
		if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
			core.info(`cleanup-github-preview-env: environment ${environment} already absent`);
			environmentDeleted = true;
		} else {
			core.warning(
				`cleanup-github-preview-env: could not delete environment ${environment} (soft-fail): ${msg}`,
			);
		}
	}

	const outcome = statusErrors > 0 ? "failure" : "success";
	core.setOutput("outcome", outcome);
	core.setOutput("inactivated", String(inactivated));
	core.setOutput("environment_deleted", environmentDeleted ? "true" : "false");
};
