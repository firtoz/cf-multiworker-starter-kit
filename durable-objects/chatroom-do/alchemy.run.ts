import alchemy from "alchemy";
import { DurableObjectNamespace, Worker, WorkerRef, WorkerStub } from "alchemy/cloudflare";
import { requireAlchemyPassword, requireEnv } from "alchemy-utils";
import { alchemyCiCloudStateStoreOptions } from "alchemy-utils/alchemy-cloud-state-store";
import { resolveStageFromEnv } from "alchemy-utils/deployment-stage";
import { workerObservabilityWithTraces } from "alchemy-utils/worker-observability";
import {
	ALCHEMY_APP_IDS,
	DEFAULT_WORKER_RESOURCE_ID,
	omitDefaultPhysicalWorkerScriptName,
} from "alchemy-utils/worker-peer-scripts";
import type { AuthWorkerRpc } from "../../workers/auth-worker/workers/rpc";

const stage = resolveStageFromEnv();
const app = await alchemy(ALCHEMY_APP_IDS.chatroom, {
	stage,
	...alchemyCiCloudStateStoreOptions(stage),
});
requireAlchemyPassword(app);
const chatroomInternalSecretRaw = requireEnv(
	"CHATROOM_INTERNAL_SECRET",
	"Shared secret used when the web worker forwards /api/ws/* to the chatroom DO",
	app,
);
const chatroomInternalSecret = alchemy.secret(chatroomInternalSecretRaw);

const PEER_AUTH_SCRIPT_NAME = omitDefaultPhysicalWorkerScriptName(ALCHEMY_APP_IDS.auth, app.stage);

await WorkerStub<AuthWorkerRpc>("auth-worker-service-stub", {
	name: PEER_AUTH_SCRIPT_NAME,
	url: false,
});

export const ChatroomDo = await DurableObjectNamespace<Rpc.DurableObjectBranded>(
	"chatroom-do-ChatroomDo-class",
	{
		className: "ChatroomDo",
		sqlite: true,
	},
);

export const chatroomWorker = await Worker(DEFAULT_WORKER_RESOURCE_ID, {
	entrypoint: new URL("./workers/app.ts", import.meta.url).pathname,
	compatibility: "node",
	placement: { mode: "smart" },
	observability: workerObservabilityWithTraces,
	dev: { port: 8783 },
	adopt: true,
	bindings: {
		CHATROOM_INTERNAL_SECRET: chatroomInternalSecret,
		ChatroomDo,
		AUTH: WorkerRef<AuthWorkerRpc>({ service: PEER_AUTH_SCRIPT_NAME }),
	},
});

export type { ChatroomWorkerRpc } from "./workers/rpc";

console.log({ worker: "chatroom-do", scriptName: chatroomWorker.name });

await app.finalize();
