// @see https://alchemy.run/concepts/bindings/#type-safe-bindings
/// <reference types="@cloudflare/workers-types" />

/** Cloudflare Workers runtime — not in the standard DOM `CacheStorage` typings. */
interface CacheStorage {
	readonly default: Cache;
}

import type { posthogProxyWorker } from "./alchemy.run";

export type CloudflareEnv = (typeof posthogProxyWorker)["Env"];

declare global {
	type Env = CloudflareEnv;
}

declare module "cloudflare:workers" {
	namespace Cloudflare {
		interface GlobalProps {}
		export interface Env extends CloudflareEnv {}
	}
}
