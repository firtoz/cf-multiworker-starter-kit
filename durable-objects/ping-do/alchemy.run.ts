import alchemy from "alchemy";
import { DurableObjectNamespace, Worker, WorkerRef, WorkerStub } from "alchemy/cloudflare";
import { requireAlchemyPassword } from "cf-starter-alchemy";
import { resolveStageFromEnv } from "cf-starter-alchemy/deployment-stage";
import {
	CF_STARTER_APPS,
	DEFAULT_WORKER_RESOURCE_ID,
	omitDefaultPhysicalWorkerScriptName,
} from "cf-starter-alchemy/worker-peer-scripts";
import type { OtherWorkerRpc } from "other-worker/alchemy";
import type { PingDoRpc } from "./workers/ping-do";

const app = await alchemy(CF_STARTER_APPS.ping, {
	stage: resolveStageFromEnv(),
});
requireAlchemyPassword(app);

const PEER_OTHER_SCRIPT_NAME = omitDefaultPhysicalWorkerScriptName(
	CF_STARTER_APPS.other,
	app.stage,
);

export const PingDo = await DurableObjectNamespace<PingDoRpc>("ping-do-PingDo-class", {
	className: "PingDo",
});

await WorkerStub<OtherWorkerRpc>("other-worker-service-stub", {
	name: PEER_OTHER_SCRIPT_NAME,
	url: false,
});

export const pingWorker = await Worker(DEFAULT_WORKER_RESOURCE_ID, {
	entrypoint: new URL("./workers/app.ts", import.meta.url).pathname,
	compatibility: "node",
	placement: { mode: "smart" },
	dev: { port: 8782 },
	adopt: true,
	bindings: {
		PingDo,
		OTHER: WorkerRef<OtherWorkerRpc>({
			service: PEER_OTHER_SCRIPT_NAME,
		}),
	},
});

console.log({ worker: "ping-do", scriptName: pingWorker.name });

await app.finalize();
