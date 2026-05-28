import { WorkerEntrypoint } from "cloudflare:workers";
import {
	CHATROOM_AUTH_DISPLAY_NAME_HEADER,
	CHATROOM_AUTH_IS_GUEST_HEADER,
	CHATROOM_AUTH_USER_ID_HEADER,
	CHATROOM_INTERNAL_SECRET_HEADER,
} from "@internal/chat-contract";
import { ChatroomDo } from "./chatroom-do";

export { ChatroomDo };

function isGuestFromAttestedHeader(raw: string | null | undefined): boolean | null {
	const v = raw?.trim().toLowerCase();
	if (v === "true") {
		return true;
	}
	if (v === "false") {
		return false;
	}
	return null;
}

export default class ChatroomWorker extends WorkerEntrypoint<Env> {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname !== "/websocket") {
			return new Response("starter-chatroom-do", {
				headers: { "Content-Type": "text/plain" },
			});
		}

		if (
			request.headers.get(CHATROOM_INTERNAL_SECRET_HEADER) !== this.env["CHATROOM_INTERNAL_SECRET"]
		) {
			return new Response("Unauthorized chatroom websocket", { status: 401 });
		}

		const userId = request.headers.get(CHATROOM_AUTH_USER_ID_HEADER)?.trim();
		const displayName = request.headers.get(CHATROOM_AUTH_DISPLAY_NAME_HEADER)?.trim();
		const isGuest = isGuestFromAttestedHeader(request.headers.get(CHATROOM_AUTH_IS_GUEST_HEADER));
		if (!userId || !displayName || isGuest === null) {
			return new Response("Missing attested chat identity", { status: 401 });
		}

		const roomRaw = url.searchParams.get("room")?.trim() || "lobby";
		const room =
			roomRaw
				.toLowerCase()
				.slice(0, 64)
				.replace(/[^a-z0-9_-]/g, "") || "lobby";
		const stub = this.env["ChatroomDo"].getByName(room);

		const forward = new URL(request.url);
		forward.pathname = "/websocket";
		const headers = new Headers(request.headers);
		headers.set(CHATROOM_AUTH_USER_ID_HEADER, userId);
		headers.set(CHATROOM_AUTH_DISPLAY_NAME_HEADER, displayName);
		headers.set(CHATROOM_AUTH_IS_GUEST_HEADER, isGuest ? "true" : "false");

		const forwardRequest = new Request(forward.toString(), {
			headers,
			method: request.method,
		});
		return stub.fetch(forwardRequest);
	}
}
