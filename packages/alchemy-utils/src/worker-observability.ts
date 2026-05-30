import type { WorkerObservability } from "alchemy/cloudflare";

/**
 * Cloudflare Workers automatic tracing (open beta) — no SDK or code changes required.
 *
 * @see https://developers.cloudflare.com/workers/observability/traces/
 */
export const workerObservabilityWithTraces: WorkerObservability = {
	traces: { enabled: true },
};
