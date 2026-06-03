import type { EnvRequirement } from "alchemy-utils/env-requirements";
import { WEB_APP_ENV_REQUIREMENTS } from "../../../apps/web/env.requirements";
import { AUTH_WORKER_ENV_REQUIREMENTS } from "../../../workers/auth-worker/env.requirements";
import { REPO_ROOT_ENV_REQUIREMENTS } from "./repo-root-env-requirements";

/** Last declaration wins when the same key appears in multiple sidecars. */
function dedupeEnvRequirementsByKey(
	requirements: readonly EnvRequirement[],
): readonly EnvRequirement[] {
	const byKey = new Map<string, EnvRequirement>();
	for (const req of requirements) {
		byKey.set(req.key, req);
	}
	return [...byKey.values()];
}

/** All env requirements for setup + `github:sync:*` + deploy preflight. */
export const ALL_REPO_ENV_REQUIREMENTS: readonly EnvRequirement[] = dedupeEnvRequirementsByKey([
	...REPO_ROOT_ENV_REQUIREMENTS,
	...WEB_APP_ENV_REQUIREMENTS,
	...AUTH_WORKER_ENV_REQUIREMENTS,
]);
