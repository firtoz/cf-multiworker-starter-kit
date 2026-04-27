import alchemy from "alchemy";
import { DurableObjectNamespace, Worker, WorkerRef, WorkerStub } from "alchemy/cloudflare";
import { alchemyPassword } from "cf-starter-alchemy";
import type { OtherWorkerRpc } from "other-worker/alchemy";
import type { PingDoRpc } from "./workers/ping-do";

const app = await alchemy("ping-do", { password: alchemyPassword });

export const PingDo = await DurableObjectNamespace<PingDoRpc>("ping-do-PingDo-class", {
	className: "PingDo",
});

await WorkerStub<OtherWorkerRpc>("other-worker-service-stub", {
	name: "cf-starter-other-worker",
	url: false,
});

export const pingWorker = await Worker("ping-do", {
	name: "cf-starter-ping-do",
	entrypoint: new URL("./workers/app.ts", import.meta.url).pathname,
	compatibility: "node",
	placement: { mode: "smart" },
	dev: { port: 8782 },
	adopt: true,
	bindings: {
		PingDo,
		OTHER: WorkerRef<OtherWorkerRpc>({ service: "cf-starter-other-worker" }),
	},
});

console.log({ worker: "ping-do", scriptName: pingWorker.name });

await app.finalize();
