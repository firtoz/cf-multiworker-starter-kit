import type { AuthWorkerRpc } from "../../../workers/auth-worker/workers/rpc";
import type { ChatroomDoRpc } from "../workers/do-rpc";

/** Chatroom worker bindings — kept free of `alchemy.run` so Hono app types stay acyclic. */
export type ChatroomWorkerBindingEnv = {
	CHATROOM_INTERNAL_SECRET: string;
	ChatroomDo: DurableObjectNamespace<ChatroomDoRpc>;
	AUTH: Fetcher<AuthWorkerRpc>;
};
