/** Typed surface for `WorkerRef<ChatroomWorkerRpc>` (web forwards `/api/ws/*` here). */
export type ChatroomWorkerRpc = {
	fetch(request: Request | string, init?: RequestInit): Promise<Response>;
};
