import { WorkerEntrypoint } from "cloudflare:workers";
import { ChatroomDo } from "./chatroom-do";

export { ChatroomDo };

export default class ChatroomWorker extends WorkerEntrypoint<Env> {
	async fetch(_request: Request): Promise<Response> {
		return new Response("starter-chatroom-do", {
			headers: { "Content-Type": "text/plain" },
		});
	}
}
