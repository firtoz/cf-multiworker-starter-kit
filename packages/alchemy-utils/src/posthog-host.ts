/**
 * PostHog env wiring:
 *
 * - **`POSTHOG_HOST`** — upstream ingest for **`workers/posthog-proxy`** only (optional; default from **`POSTHOG_REGION`**).
 * - Browser **`api_host`** — same-origin **`POSTHOG_INGEST_API_PATH`** on the web worker (forwards to the proxy service binding).
 */

export const POSTHOG_REGION_ENV_KEY = "POSTHOG_REGION" as const;
/** Upstream PostHog Cloud ingest — **`workers/posthog-proxy`** binding only. */
export const POSTHOG_HOST_ENV_KEY = "POSTHOG_HOST" as const;

/** Same-origin path the browser uses for PostHog ingest (web worker forwards to **`POSTHOG`** binding). */
export const POSTHOG_INGEST_API_PATH = "/ingest" as const;

export function parsePosthogHostUrl(raw: string | undefined): URL | null {
	const trimmed = raw?.trim();
	if (!trimmed) {
		return null;
	}
	try {
		return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
	} catch {
		return null;
	}
}

/** Normalize an origin URL (no trailing slash). */
export function normalizePosthogApiHostOrigin(raw: string | undefined): string {
	const url = parsePosthogHostUrl(raw);
	if (!url) {
		return "";
	}
	return url.origin;
}

export function posthogRegionFromProcessEnv(env: NodeJS.ProcessEnv = process.env): "eu" | "us" {
	const raw = env[POSTHOG_REGION_ENV_KEY]?.trim().toLowerCase();
	return raw === "us" ? "us" : "eu";
}

export function defaultPosthogIngestOriginForRegion(region: "eu" | "us"): string {
	return region === "us" ? "https://us.i.posthog.com" : "https://eu.i.posthog.com";
}

export function defaultPosthogAssetsHostForRegion(region: "eu" | "us"): string {
	return region === "us" ? "us-assets.i.posthog.com" : "eu-assets.i.posthog.com";
}

export function defaultPosthogUiHostForRegion(region: "eu" | "us"): string {
	return region === "us" ? "https://us.posthog.com" : "https://eu.posthog.com";
}

/** Upstream ingest origin for the proxy Worker (`POSTHOG_HOST` or region default). */
export function resolvePosthogUpstreamIngestOrigin(env: NodeJS.ProcessEnv = process.env): string {
	const explicit = env[POSTHOG_HOST_ENV_KEY]?.trim();
	if (explicit) {
		const normalized = normalizePosthogApiHostOrigin(explicit);
		if (normalized) {
			return normalized;
		}
	}
	return defaultPosthogIngestOriginForRegion(posthogRegionFromProcessEnv(env));
}

/**
 * Strip **`POSTHOG_INGEST_API_PATH`** before forwarding to the proxy Worker (expects root PostHog paths).
 */
export function rewritePosthogIngestRequest(
	request: Request,
	ingestPath: string = POSTHOG_INGEST_API_PATH,
): Request {
	const url = new URL(request.url);
	if (!url.pathname.startsWith(ingestPath)) {
		return request;
	}
	const rest = url.pathname.slice(ingestPath.length);
	url.pathname = rest === "" || rest === "/" ? "/" : rest.startsWith("/") ? rest : `/${rest}`;
	return new Request(url.toString(), request);
}

export function isPosthogAnalyticsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
	return Boolean(env["POSTHOG_KEY"]?.trim());
}
