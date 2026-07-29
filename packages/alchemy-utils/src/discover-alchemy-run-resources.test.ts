import { describe, expect, test } from "bun:test";
import {
	discoverAlchemyRunResources,
	skipOptionalTypeArgs,
} from "./discover-alchemy-run-resources";
import { DEFAULT_WORKER_RESOURCE_ID } from "./worker-peer-scripts";

describe("skipOptionalTypeArgs", () => {
	test("leaves plain calls unchanged", () => {
		expect(skipOptionalTypeArgs("Worker(", 6)).toBe(6);
	});

	test("skips single-level and nested generics", () => {
		const single = "Worker<typeof X>(";
		expect(skipOptionalTypeArgs(single, 6)).toBe(single.indexOf("("));
		const nested = "Worker<Map<string, Foo>, Rpc>(";
		expect(skipOptionalTypeArgs(nested, 6)).toBe(nested.indexOf("("));
	});
});

describe("discoverAlchemyRunResources", () => {
	test("finds Worker(DEFAULT_WORKER_RESOURCE_ID, …)", () => {
		const src = `export const w = await Worker(${"DEFAULT_WORKER_RESOURCE_ID"}, { adopt: true });`;
		expect(discoverAlchemyRunResources(src)).toEqual([
			{ kind: "worker", id: DEFAULT_WORKER_RESOURCE_ID },
		]);
	});

	test("finds Worker with TypeScript generics (chatroom pattern)", () => {
		const src = `
export const chatroomWorker = await Worker<typeof chatroomWorkerBindings, ChatroomWorkerRpc>(
	DEFAULT_WORKER_RESOURCE_ID,
	{ adopt: true },
);
`;
		expect(discoverAlchemyRunResources(src)).toEqual([
			{ kind: "worker", id: DEFAULT_WORKER_RESOURCE_ID },
		]);
	});

	test("finds nested generics and string resource ids", () => {
		const src = `
await Worker<Map<string, Bindings>, Rpc>("custom-worker", {});
await D1Database("main-db", {});
await KVNamespace(DEFAULT_AUTH_KV_RESOURCE_ID, {});
`;
		const found = discoverAlchemyRunResources(src);
		expect(found.some((r) => r.kind === "worker" && r.id === "custom-worker")).toBe(true);
		expect(found.some((r) => r.kind === "d1" && r.id === "main-db")).toBe(true);
		expect(found.some((r) => r.kind === "kv")).toBe(true);
	});

	test("ignores type-only mentions without a call", () => {
		const src = `type W = Worker; const x = WorkerRef({});`;
		expect(discoverAlchemyRunResources(src)).toEqual([]);
	});
});
