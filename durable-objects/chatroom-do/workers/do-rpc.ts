import type { ChatroomDo } from "./chatroom-do";

/** Hono `app` on the DO — use with `honoDoFetcherWithName(env.ChatroomDo, room)`. */
export type ChatroomDoRpc = Rpc.DurableObjectBranded & Pick<ChatroomDo, "app">;
