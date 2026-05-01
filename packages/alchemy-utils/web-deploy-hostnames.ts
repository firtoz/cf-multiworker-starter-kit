/**
 * Optional Workers Custom Domains + Routes derived from staging/prod env (see README "Custom domains").
 * Used by `apps/web/alchemy.run.ts` and synced to GitHub Environments via `packages/scripts/github-environment-secrets.ts`.
 */

/** Comma-separated hostnames — e.g. `example.com,www.example.com` */
export const WEB_DOMAINS_ENV_KEY = "WEB_DOMAINS" as const;
/** Comma-separated route patterns — e.g. `example.com/*` (escape hatch vs {@link WEB_DOMAINS_ENV_KEY}) */
export const WEB_ROUTES_ENV_KEY = "WEB_ROUTES" as const;
/** Applied to each domain/route when set (otherwise Alchemy infers zone from hostname) */
export const WEB_ZONE_ID_ENV_KEY = "WEB_ZONE_ID" as const;
/**
 * Truthy (`true`, `1`, `yes`): transfer hostname already bound elsewhere.
 * @see Cloudflare Workers Custom Domains + Alchemy Worker `domains` props
 */
export const WEB_DOMAIN_OVERRIDE_EXISTING_ORIGIN_ENV_KEY =
	"WEB_DOMAIN_OVERRIDE_EXISTING_ORIGIN" as const;

/** Optional GitHub Environment variables synced from `.env.staging` / `.env.production` when non-empty */
export const GITHUB_SYNC_OPTIONAL_WEB_HOSTNAME_VARIABLE_KEYS = [
	WEB_DOMAINS_ENV_KEY,
	WEB_ROUTES_ENV_KEY,
	WEB_ZONE_ID_ENV_KEY,
	WEB_DOMAIN_OVERRIDE_EXISTING_ORIGIN_ENV_KEY,
] as const;

export type WebHostnameDomainBinding = {
	readonly domainName: string;
	readonly zoneId?: string;
	readonly adopt: true;
	readonly overrideExistingOrigin?: boolean;
};

export type WebHostnameRouteBinding = {
	readonly pattern: string;
	readonly zoneId?: string;
	readonly adopt: true;
};

/** Split trimmed, non-empty segments from comma-separated env */
export function commaSeparatedEnvSegments(raw: string | undefined): string[] {
	if (raw === undefined || raw.trim() === "") {
		return [];
	}
	return raw
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s !== "");
}

/** When unset or empty → `false`; accepts `true` / `1` / `yes` (case-insensitive) */
export function parseWebHostnameOverrideExistingOrigin(raw: string | undefined): boolean {
	if (raw === undefined || raw.trim() === "") {
		return false;
	}
	return ["true", "1", "yes"].includes(raw.trim().toLowerCase());
}

/** From `process.env` — omit entries when unset; default `workers.dev`-only deploy */
export function reactRouterDomainsFromProcessEnv(
	env: NodeJS.ProcessEnv = process.env,
): readonly WebHostnameDomainBinding[] {
	const zoneRaw = env[WEB_ZONE_ID_ENV_KEY]?.trim();
	const zoneId = zoneRaw === "" ? undefined : zoneRaw;
	const override = parseWebHostnameOverrideExistingOrigin(
		env[WEB_DOMAIN_OVERRIDE_EXISTING_ORIGIN_ENV_KEY],
	);

	const names = commaSeparatedEnvSegments(env[WEB_DOMAINS_ENV_KEY]);
	const out: WebHostnameDomainBinding[] = [];
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

/** From `process.env` — omit when unset */
export function reactRouterRoutesFromProcessEnv(
	env: NodeJS.ProcessEnv = process.env,
): readonly WebHostnameRouteBinding[] {
	const zoneRaw = env[WEB_ZONE_ID_ENV_KEY]?.trim();
	const zoneId = zoneRaw === "" ? undefined : zoneRaw;

	const patterns = commaSeparatedEnvSegments(env[WEB_ROUTES_ENV_KEY]);
	const out: WebHostnameRouteBinding[] = [];
	for (const pattern of patterns) {
		out.push({
			pattern,
			...(zoneId ? { zoneId } : {}),
			adopt: true,
		});
	}
	return out;
}
