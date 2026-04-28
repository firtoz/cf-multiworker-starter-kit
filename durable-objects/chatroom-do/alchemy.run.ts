import alchemy from "alchemy";
import { DurableObjectNamespace, Worker } from "alchemy/cloudflare";
import { requireAlchemyPassword, requireEnv } from "cf-starter-alchemy";
import {
	CF_STARTER_APPS,
	DEFAULT_WORKER_RESOURCE_ID,
} from "cf-starter-alchemy/worker-peer-scripts";

const app = await alchemy(CF_STARTER_APPS.chatroom);
requireAlchemyPassword(app);
const chatroomInternalSecretRaw = requireEnv(
	"CHATROOM_INTERNAL_SECRET",
	"Shared secret used when the web worker forwards /api/ws/* to the chatroom DO",
	app,
);
const chatroomInternalSecret = alchemy.secret(chatroomInternalSecretRaw);

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
	dev: { port: 8783 },
	adopt: true,
	bindings: {
		CHATROOM_INTERNAL_SECRET: chatroomInternalSecret,
		ChatroomDo,
	},
});

console.log({ worker: "chatroom-do", scriptName: chatroomWorker.name });

await app.finalize();
