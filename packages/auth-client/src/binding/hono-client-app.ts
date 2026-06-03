import type { Hono as HonoType } from "hono";

type ClientEnv = Record<string, never>;

/** Strip server Bindings/Variables — schema only, for `@firtoz/hono-fetcher`. */
export type HonoClientApp<T> =
	T extends HonoType<
		// biome-ignore lint/suspicious/noExplicitAny: server env varies; only schema is extracted
		any,
		infer S,
		infer B
	>
		? HonoType<ClientEnv, S, B>
		: never;
