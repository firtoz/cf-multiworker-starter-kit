/**
 * Web worker service-binding registry — extend via `declare global` (same idea as
 * `cloudflare:workers` Env merge or React Router `AppLoadContext` augmentation).
 *
 * When adding a bound worker with a Hono `app`:
 * 1. Export `YourWorkerHonoClientApp` from the worker package.
 * 2. Add a key here matching the binding name in `apps/web/alchemy.run.ts`.
 * 3. Optionally add sibling maps (`Rpc`, `EnvSlice`, …) for other typed helpers.
 */
import type { ChatroomWorkerHonoClientApp } from "chatroom-do/hono-app";

declare global {
	namespace WorkerBindingRegistry {
		/** `@firtoz/hono-fetcher` client schema per `CloudflareEnv` service binding. */
		interface HonoClients {
			CHATROOM: ChatroomWorkerHonoClientApp;
		}
	}
}
