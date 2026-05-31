import type { Hono } from "hono";

/** Any Hono instance — bare `Hono` is not a supertype of `typeof app` in Hono v4. */
export type AnyHonoInstance = Hono<
	// biome-ignore lint/suspicious/noExplicitAny: env/schema vary per worker
	any,
	// biome-ignore lint/suspicious/noExplicitAny:
	any,
	// biome-ignore lint/suspicious/noExplicitAny:
	any
>;

/**
 * RPC for a worker entrypoint with a Hono `app` and a **pre-resolved** client schema.
 *
 * Define `clientApp` beside `app` in the worker package (see chatroom-do `hono-app.ts`) so
 * `HonoClientApp<typeof app>` is evaluated once — generic `HonoClientApp<App>` at the call
 * site does not preserve route output types in TS.
 */
export type WorkerRpcWithHonoClient<
	App extends AnyHonoInstance = AnyHonoInstance,
	ClientApp extends Hono = Hono,
> = Rpc.WorkerEntrypointBranded & {
	readonly app: App;
	readonly clientApp: ClientApp;
};

/** @deprecated Use {@link WorkerRpcWithHonoClient} with `clientApp` set at the worker package. */
export type WorkerRpcWithHonoApp<
	App extends AnyHonoInstance = AnyHonoInstance,
	ClientApp extends Hono = Hono,
> = WorkerRpcWithHonoClient<App, ClientApp>;
