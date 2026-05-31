import { honoFetcher, type TypedHonoFetcher } from "@firtoz/hono-fetcher";
import type { CloudflareEnv } from "../../types/env";

/**
 * Typed Hono client from a service binding on `CloudflareEnv`.
 *
 * Register each binding in [`worker-binding-registry.d.ts`](../../types/worker-binding-registry.d.ts)
 * (`WorkerBindingRegistry.HonoClients`) — same augmentation pattern as `cloudflare:workers` Env.
 *
 * @example
 * ```ts
 * const api = bindingHonoClient(env.CHATROOM);
 * await api.get({ url: "/service-ack" });
 * ```
 */
export function bindingHonoClient<const K extends keyof WorkerBindingRegistry.HonoClients>(
	binding: CloudflareEnv[K],
	origin = "http://service-binding",
): TypedHonoFetcher<WorkerBindingRegistry.HonoClients[K]> {
	type ClientApp = WorkerBindingRegistry.HonoClients[K];
	const wireFetch = (url: string, init?: RequestInit) => binding.fetch(`${origin}${url}`, init);
	return honoFetcher<ClientApp>(
		(url, init) => wireFetch(url, init) as ReturnType<ClientApp["request"]>,
	);
}
