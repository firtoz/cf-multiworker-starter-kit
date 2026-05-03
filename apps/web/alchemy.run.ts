import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { mainDb } from "@internal/db/alchemy";
import alchemy from "alchemy";
import { ReactRouter } from "alchemy/cloudflare";
import { requireAlchemyPassword, requireEnv } from "alchemy-utils";
import { alchemyCiCloudStateStoreOptions } from "alchemy-utils/alchemy-cloud-state-store";
import { CI_WEB_DEPLOY_URL_RELPATH } from "alchemy-utils/ci-deploy-web-url";
import { isPrStage, resolveStageFromEnv } from "alchemy-utils/deployment-stage";
import {
	reactRouterDomainsFromProcessEnv,
	reactRouterRoutesFromProcessEnv,
} from "alchemy-utils/web-deploy-hostnames";
import {
	ALCHEMY_APP_IDS,
	DEFAULT_REACT_ROUTER_WEB_RESOURCE_ID,
} from "alchemy-utils/worker-peer-scripts";
import { chatroomWorker } from "chatroom-do/alchemy";
import { otherWorker } from "other-worker/alchemy";
import { pingWorker } from "ping-do/alchemy";

const stage = resolveStageFromEnv();
const app = await alchemy(ALCHEMY_APP_IDS.frontend, {
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

const skipWebCustomHostnames = isPrStage(stage);
const webDomains = skipWebCustomHostnames ? [] : [...reactRouterDomainsFromProcessEnv()];
const webRoutes = skipWebCustomHostnames ? [] : [...reactRouterRoutesFromProcessEnv()];

export const web = await ReactRouter(DEFAULT_REACT_ROUTER_WEB_RESOURCE_ID, {
	main: "workers/app.ts",
	compatibility: "node",
	placement: { mode: "smart" },
	url: true,
	adopt: true,
	routes: webRoutes,
	domains: webDomains,
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
/** GitHub Actions: write URL for deploy workflows — see **`CI_WEB_DEPLOY_URL_RELPATH`**. */
if (process.env["GITHUB_ACTIONS"] === "true" && web.url) {
	const root = process.env["GITHUB_WORKSPACE"]?.trim();
	if (root) {
		const filePath = path.join(root, CI_WEB_DEPLOY_URL_RELPATH);
		mkdirSync(path.dirname(filePath), { recursive: true });
		writeFileSync(filePath, `${web.url.trim()}\n`, "utf8");
	}
}

// PR preview comments belong in `.github/workflows/pr-deploy.yml`. Avoid `alchemy/github`
// `GitHubComment` here on CI + `STAGE=pr-*` — `verifyGitHubAuth` often 404s for fork/private PRs.

await app.finalize();
