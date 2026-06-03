/**
 * Cloudflare Worker reverse proxy for PostHog (self-hosted alternative to PostHog managed proxy).
 * @see https://posthog.com/docs/advanced/proxy/cloudflare
 */

const API_HOSTS = {
	eu: "eu.i.posthog.com",
	us: "us.i.posthog.com",
} as const;

const ASSET_HOSTS = {
	eu: "eu-assets.i.posthog.com",
	us: "us-assets.i.posthog.com",
} as const;

type PosthogRegion = keyof typeof API_HOSTS;

function regionFromEnv(env: Env): PosthogRegion {
	return env.POSTHOG_REGION === "us" ? "us" : "eu";
}

function parsePosthogHostUrl(raw: string | undefined): URL | null {
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

function upstreamApiHostname(env: Env): string {
	const parsed = parsePosthogHostUrl(env.POSTHOG_HOST);
	if (parsed) {
		return parsed.hostname;
	}
	return API_HOSTS[regionFromEnv(env)];
}

function upstreamAssetHostname(env: Env): string {
	const parsed = parsePosthogHostUrl(env.POSTHOG_HOST);
	if (parsed) {
		const h = parsed.hostname.toLowerCase();
		if (h.includes("eu.")) {
			return ASSET_HOSTS.eu;
		}
		if (h.startsWith("us.") || h.includes(".us.")) {
			return ASSET_HOSTS.us;
		}
	}
	return ASSET_HOSTS[regionFromEnv(env)];
}

function isAssetPath(pathname: string): boolean {
	return pathname.startsWith("/static/") || pathname.startsWith("/array/");
}

function addCorsHeaders(response: Response, request: Request, pathname: string): Response {
	const newHeaders = new Headers(response.headers);
	const origin = request.headers.get("Origin");

	newHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
	newHeaders.set("Access-Control-Allow-Headers", "*");

	if (isAssetPath(pathname) || !origin) {
		newHeaders.set("Access-Control-Allow-Origin", "*");
	} else {
		newHeaders.set("Access-Control-Allow-Origin", origin);
		newHeaders.set("Access-Control-Allow-Credentials", "true");
		newHeaders.append("Vary", "Origin");
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: newHeaders,
	});
}

async function retrieveAsset(
	request: Request,
	pathWithParams: string,
	ctx: ExecutionContext,
	assetHost: string,
): Promise<Response> {
	const cache = caches.default;
	let response = await cache.match(request);
	if (!response) {
		response = await fetch(`https://${assetHost}${pathWithParams}`);
		ctx.waitUntil(cache.put(request, response.clone()));
	}
	return response;
}

async function forwardRequest(
	request: Request,
	pathWithSearch: string,
	apiHost: string,
): Promise<Response> {
	const ip = request.headers.get("CF-Connecting-IP") ?? "";
	const originHeaders = new Headers(request.headers);
	originHeaders.delete("cookie");
	originHeaders.set("X-Forwarded-For", ip);

	const originRequest = new Request(`https://${apiHost}${pathWithSearch}`, {
		method: request.method,
		headers: originHeaders,
		body:
			request.method !== "GET" && request.method !== "HEAD" ? await request.arrayBuffer() : null,
		redirect: request.redirect,
	});

	return fetch(originRequest);
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const pathname = url.pathname;
		const pathWithParams = pathname + url.search;

		if (request.method === "OPTIONS") {
			return addCorsHeaders(new Response(null, { status: 204 }), request, pathname);
		}

		const apiHost = upstreamApiHostname(env);
		const assetHost = upstreamAssetHostname(env);

		const response = isAssetPath(pathname)
			? await retrieveAsset(request, pathWithParams, ctx, assetHost)
			: await forwardRequest(request, pathWithParams, apiHost);

		return addCorsHeaders(response, request, pathname);
	},
};
