import alchemy from "alchemy";
import { Worker } from "alchemy/cloudflare";
import { requireAlchemyPassword } from "alchemy-utils";
import { alchemyCiCloudStateStoreOptions } from "alchemy-utils/alchemy-cloud-state-store";
import { resolveStageFromEnv } from "alchemy-utils/deployment-stage";
import { LOCAL_POSTHOG_PROXY_DEV_PORT } from "alchemy-utils/local-portless-dev";
import {
	posthogRegionFromProcessEnv,
	resolvePosthogUpstreamIngestOrigin,
} from "alchemy-utils/posthog-host";
import { workerObservabilityWithTraces } from "alchemy-utils/worker-observability";
import { ALCHEMY_APP_IDS, DEFAULT_WORKER_RESOURCE_ID } from "alchemy-utils/worker-peer-scripts";

const stage = resolveStageFromEnv();
const app = await alchemy(ALCHEMY_APP_IDS.posthogProxy, {
	stage,
	...alchemyCiCloudStateStoreOptions(stage),
});
requireAlchemyPassword(app);

const posthogRegion = posthogRegionFromProcessEnv();
const posthogUpstreamHost = resolvePosthogUpstreamIngestOrigin();

export const posthogProxyWorker = await Worker(DEFAULT_WORKER_RESOURCE_ID, {
	entrypoint: new URL("./workers/app.ts", import.meta.url).pathname,
	compatibility: "node",
	placement: { mode: "smart" },
	observability: workerObservabilityWithTraces,
	dev: { port: LOCAL_POSTHOG_PROXY_DEV_PORT },
	adopt: true,
	url: false,
	previewSubdomains: false,
	domains: [],
	bindings: {
		POSTHOG_REGION: posthogRegion,
		POSTHOG_HOST: posthogUpstreamHost,
	},
});

console.log({
	worker: "posthog-proxy",
	scriptName: posthogProxyWorker.name,
	upstreamPosthogHost: posthogUpstreamHost,
	region: posthogRegion,
});

await app.finalize();
