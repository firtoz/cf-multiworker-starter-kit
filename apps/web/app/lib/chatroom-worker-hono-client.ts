import type { CloudflareEnv } from "../../types/env";

/** Alchemy-typed `CHATROOM` service binding on the web worker (`BoundWorker<ChatroomWorkerRpc>`). */
export type ChatroomWorkerBinding = CloudflareEnv["CHATROOM"];

/** Env slice for code that calls the chatroom worker over a service binding. */
export type ChatroomBindingEnv = Pick<CloudflareEnv, "CHATROOM" | "CHATROOM_INTERNAL_SECRET">;
