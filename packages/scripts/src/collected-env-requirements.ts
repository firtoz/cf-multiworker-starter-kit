import type { EnvRequirement } from "alchemy-utils/env-requirements";
import { WEB_APP_ENV_REQUIREMENTS } from "../../../apps/web/env.requirements";
import { REPO_ROOT_ENV_REQUIREMENTS } from "./repo-root-env-requirements";

/** All env requirements for setup + `github:sync:*` + deploy preflight. */
export const ALL_REPO_ENV_REQUIREMENTS: readonly EnvRequirement[] = [
	...REPO_ROOT_ENV_REQUIREMENTS,
	...WEB_APP_ENV_REQUIREMENTS,
];
