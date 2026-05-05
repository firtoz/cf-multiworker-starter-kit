/**
 * CI teardown gate: required deploy-process env (non-empty) without honoring **`DEPLOY_ENABLED`**.
 * Use before **`alchemy destroy`** so preview stacks are not orphaned when deploy preflight short-circuits.
 */
import process from "node:process";
import { missingDeployConfigurationKeys } from "./github-environment-secrets";

const isCi = process.env.CI === "true";
const envBag = { ...process.env } as Record<string, string | undefined>;
const missing = missingDeployConfigurationKeys(envBag, { requiresAlchemyStateToken: isCi });

if (missing.length > 0) {
	console.error("verify-deploy-env: missing required deploy configuration:");
	for (const k of missing) {
		console.error(`  - ${k}`);
	}
	process.exit(1);
}

console.log("verify-deploy-env — ok\n");
process.exit(0);
