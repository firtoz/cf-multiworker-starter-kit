import alchemy from "alchemy";
import { ReactRouter } from "alchemy/cloudflare";
import { requireAlchemyPassword, requireEnv } from "cf-starter-alchemy";
import { alchemyCiCloudStateStoreOptions } from "cf-starter-alchemy/alchemy-cloud-state-store";
import { resolveStageFromEnv } from "cf-starter-alchemy/deployment-stage";
import {
	CF_STARTER_APPS,
	DEFAULT_REACT_ROUTER_WEB_RESOURCE_ID,
} from "cf-starter-alchemy/worker-peer-scripts";
import { mainDb } from "cf-starter-db/alchemy";
import { chatroomWorker } from "chatroom-do/alchemy";
import { otherWorker } from "other-worker/alchemy";
import { pingWorker } from "ping-do/alchemy";

const stage = resolveStageFromEnv();
const app = await alchemy(CF_STARTER_APPS.frontend, {
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
const ChatroomDo = chatroomWorker.bindings.ChatroomDo;
const PingDo = pingWorker.bindings.PingDo;

export const web = await ReactRouter(DEFAULT_REACT_ROUTER_WEB_RESOURCE_ID, {
	main: "workers/app.ts",
	compatibility: "node",
	placement: { mode: "smart" },
	url: true,
	adopt: true,
	bindings: {
		DB: mainDb,
		CHATROOM_INTERNAL_SECRET: chatroomInternalSecret,
		ChatroomDo,
		PingDo,
		PING: pingWorker,
		OTHER: otherWorker,
	},
});

console.log({ webUrl: web.url });

await app.finalize();
