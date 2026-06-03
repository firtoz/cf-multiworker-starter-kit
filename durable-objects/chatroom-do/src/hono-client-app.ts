import type { Hono } from "hono";

type ClientEnv = Record<string, never>;

/**
 * Client-side view of a Hono app — same routes/schema, server env stripped.
 * `[T]` prevents distributive conditional inference from erasing schema when `T` is generic.
 */
export type HonoClientApp<T> = [T] extends [Hono<infer _E, infer S, infer BasePath extends string>]
	? Hono<ClientEnv, S, BasePath>
	: never;
