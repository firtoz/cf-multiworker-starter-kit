import alchemy from "alchemy";
import { Worker, WorkerRef, WorkerStub } from "alchemy/cloudflare";
import { requireAlchemyPassword } from "alchemy-utils";
import { alchemyCiCloudStateStoreOptions } from "alchemy-utils/alchemy-cloud-state-store";
import { resolveStageFromEnv } from "alchemy-utils/deployment-stage";
import {
	CF_STARTER_APPS,
	DEFAULT_WORKER_RESOURCE_ID,
	omitDefaultPhysicalWorkerScriptName,
} from "alchemy-utils/worker-peer-scripts";
// Keep this as a relative type import: ping-do already depends on other-worker,
// so a workspace import here would create a Turbo package graph cycle.
import type { PingWorkerRpc } from "../ping-do/workers/rpc";

export type { OtherWorkerRpc } from "./workers/rpc";

const stage = resolveStageFromEnv();
const app = await alchemy(CF_STARTER_APPS.other, {
	stage,
	...alchemyCiCloudStateStoreOptions(stage),
});
requireAlchemyPassword(app);

const PEER_PING_SCRIPT_NAME = omitDefaultPhysicalWorkerScriptName(CF_STARTER_APPS.ping, app.stage);

await WorkerStub<PingWorkerRpc>("ping-worker-service-stub", {
	name: PEER_PING_SCRIPT_NAME,
	url: false,
});

export const otherWorker = await Worker(DEFAULT_WORKER_RESOURCE_ID, {
	entrypoint: new URL("./workers/app.ts", import.meta.url).pathname,
	compatibility: "node",
	placement: { mode: "smart" },
	dev: { port: 8781 },
	adopt: true,
	bindings: {
		PING: WorkerRef<PingWorkerRpc>({ service: PEER_PING_SCRIPT_NAME }),
	},
});

console.log({ worker: "other-worker", scriptName: otherWorker.name });

await app.finalize();
