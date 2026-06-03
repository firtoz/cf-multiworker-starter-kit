import { resolve } from "node:path";

import { runAlchemyStatePasswordPreflight } from "./alchemy-state-password-preflight.js";
import { runLocalDevEnvPreflight } from "./dev-env-preflight.js";

const root = resolve(import.meta.dir, "../../..");

async function main() {
	try {
		runLocalDevEnvPreflight(root);
		await runAlchemyStatePasswordPreflight(root);
	} catch (e) {
		console.error(e);
		process.exit(1);
	}

	console.log("[dev:preflight] Local env and Alchemy preflight done.");
}

void main().catch((e) => {
	console.error(e);
	process.exit(1);
});
