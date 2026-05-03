/**
 * Deletes the per-PR CloudflareStateStore Worker after a successful preview destroy.
 *
 * Normal `alchemy destroy` cannot remove the state store it is actively using. Run this only
 * after the preview graph has been destroyed, and only for `STAGE=pr-<number>`.
 */
import process from "node:process";
import { sanitizeAlchemyStateStoreStageSlug } from "alchemy-utils/alchemy-cloud-state-store";
import { isPrStage, resolveStageFromEnv } from "alchemy-utils/deployment-stage";
import { PRODUCT_PREFIX } from "alchemy-utils/worker-peer-scripts";

function requireEnv(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) {
		console.error(`cleanup-preview-alchemy-state: missing ${name}`);
		process.exit(1);
	}
	return value;
}

async function main(): Promise<void> {
	const stage = resolveStageFromEnv();
	if (!isPrStage(stage)) {
		console.error(
			`cleanup-preview-alchemy-state: refusing to delete state store for non-preview STAGE=${JSON.stringify(stage)}`,
		);
		process.exit(1);
	}

	const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
	const apiToken = requireEnv("CLOUDFLARE_API_TOKEN");
	const stageSlug = sanitizeAlchemyStateStoreStageSlug(stage);
	const scriptName = `${PRODUCT_PREFIX}-alchemy-state-${stageSlug}`;
	const url = new URL(
		`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}`,
	);
	url.searchParams.set("force", "true");

	const response = await fetch(url, {
		method: "DELETE",
		headers: {
			Authorization: `Bearer ${apiToken}`,
		},
	});

	if (response.status === 404) {
		console.log(`cleanup-preview-alchemy-state: ${scriptName} was already absent.`);
		return;
	}

	if (!response.ok) {
		const body = await response.text();
		console.error(
			`cleanup-preview-alchemy-state: failed to delete ${scriptName} (${response.status} ${response.statusText})`,
		);
		console.error(body);
		process.exit(1);
	}

	console.log(`cleanup-preview-alchemy-state: deleted ${scriptName}.`);
}

await main();
