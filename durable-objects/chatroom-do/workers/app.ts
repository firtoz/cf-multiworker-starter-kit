import { WorkerEntrypoint } from "cloudflare:workers";
import { chatroomWorkerApp } from "../src/hono-app";
import { ChatroomDo } from "./chatroom-do";

export { ChatroomDo };

export default class ChatroomWorker extends WorkerEntrypoint<Env> {
	readonly app = chatroomWorkerApp;

	async fetch(request: Request): Promise<Response> {
		return chatroomWorkerApp.fetch(request, this.env, this.ctx);
	}
}
