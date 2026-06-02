/**
 * Optional Workers Custom Domains for the auth worker (see .agents/skills/cf-auth-setup).
 */

export const AUTH_DOMAINS_ENV_KEY = "AUTH_DOMAINS" as const;
export const AUTH_ZONE_ID_ENV_KEY = "AUTH_ZONE_ID" as const;
export const AUTH_DOMAIN_OVERRIDE_EXISTING_ORIGIN_ENV_KEY =
	"AUTH_DOMAIN_OVERRIDE_EXISTING_ORIGIN" as const;

export const GITHUB_SYNC_OPTIONAL_AUTH_HOSTNAME_VARIABLE_KEYS = [
	AUTH_DOMAINS_ENV_KEY,
	AUTH_ZONE_ID_ENV_KEY,
	AUTH_DOMAIN_OVERRIDE_EXISTING_ORIGIN_ENV_KEY,
] as const;

export type AuthHostnameDomainBinding = {
	readonly domainName: string;
	readonly zoneId?: string;
	readonly adopt: true;
	readonly overrideExistingOrigin?: boolean;
};

import { computeWorkerDevDomain, createCloudflareApi } from "alchemy/cloudflare";
import { isPrStage } from "./deployment-stage";
import { defaultLocalAuthBaseUrl } from "./local-portless-dev";
import {
	commaSeparatedEnvSegments,
	parseWebHostnameOverrideExistingOrigin,
	WEB_DOMAINS_ENV_KEY,
} from "./web-deploy-hostnames";
import { physicalWebScriptName } from "./worker-peer-scripts";

export function authDomainsFromProcessEnv(
	env: NodeJS.ProcessEnv = process.env,
): readonly AuthHostnameDomainBinding[] {
	const zoneRaw = env[AUTH_ZONE_ID_ENV_KEY]?.trim();
	const zoneId = zoneRaw === "" ? undefined : zoneRaw;
	const override = parseWebHostnameOverrideExistingOrigin(
		env[AUTH_DOMAIN_OVERRIDE_EXISTING_ORIGIN_ENV_KEY],
	);

	const names = commaSeparatedEnvSegments(env[AUTH_DOMAINS_ENV_KEY]);
	const out: AuthHostnameDomainBinding[] = [];
	for (const domainName of names) {
		if (override) {
			out.push({
				domainName,
				...(zoneId ? { zoneId } : {}),
				adopt: true,
				overrideExistingOrigin: true,
			});
		} else {
			out.push({
				domainName,
				...(zoneId ? { zoneId } : {}),
				adopt: true,
			});
		}
	}
	return out;
}

function httpsOriginFromHostname(hostname: string): string {
	return `https://${hostname}`;
}

/**
 * Sync slice of the auth public URL ladder (local web origin → WEB_DOMAINS).
 * Returns `undefined` when deploy should infer the web worker **workers.dev** URL via Cloudflare API.
 *
 * Auth is always reached through the web worker (`/api/auth/*` proxy). **`AUTH_DOMAINS`** is not used.
 */
export function resolveAuthBaseUrlFromProcessEnv(
	env: NodeJS.ProcessEnv = process.env,
	stage = env["STAGE"]?.trim() ?? "",
): string | undefined {
	const local = defaultLocalAuthBaseUrl(env, stage);
	if (local) {
		return local;
	}

	if (stage && !isPrStage(stage)) {
		const webDomains = commaSeparatedEnvSegments(env[WEB_DOMAINS_ENV_KEY]);
		const webHost = webDomains[0];
		if (webHost) {
			return httpsOriginFromHostname(webHost);
		}
	}

	return undefined;
}

export type ResolveAuthBaseUrlOptions = {
	readonly env?: NodeJS.ProcessEnv;
	readonly stage: string;
};

/**
 * Canonical Better Auth public URL — wired to the auth worker `AUTH_BASE_URL` binding (must match the web origin when using `/api/auth/*` proxy).
 *
 * Ladder: local Portless web URL → **`WEB_DOMAINS`** (skipped on **`STAGE=pr-*`**)
 * → inferred web **workers.dev** URL (requires Cloudflare API creds).
 */
export async function resolveAuthBaseUrl(options: ResolveAuthBaseUrlOptions): Promise<string> {
	const env = options.env ?? process.env;
	const sync = resolveAuthBaseUrlFromProcessEnv(env, options.stage);
	if (sync) {
		return sync;
	}

	const accountId = env["CLOUDFLARE_ACCOUNT_ID"]?.trim();
	const apiToken = env["CLOUDFLARE_API_TOKEN"]?.trim();
	if (!accountId || !apiToken) {
		throw new Error(
			[
				"Missing auth public URL: set WEB_DOMAINS, or ensure CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN",
				"are set so Alchemy can infer the web workers.dev URL (see .env.example).",
			].join(" "),
		);
	}

	const api = await createCloudflareApi({ accountId });
	const host = await computeWorkerDevDomain(api, physicalWebScriptName(options.stage));
	return `https://${host}`;
}
