const TRUSTED_ORIGINS_KV_KEY = "trusted_origins";
const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedOrigins: string[] | null = null;
let cacheExpiry = 0;

export function bustTrustedOriginsCache(): void {
	cachedOrigins = null;
	cacheExpiry = 0;
}

export async function getTrustedOrigins(kv: KVNamespace): Promise<string[]> {
	const now = Date.now();
	if (cachedOrigins !== null && now < cacheExpiry) {
		return cachedOrigins;
	}
	const raw = await kv.get(TRUSTED_ORIGINS_KV_KEY);
	const parsed = raw ? (JSON.parse(raw) as string[]) : [];
	cachedOrigins = parsed;
	cacheExpiry = now + CACHE_TTL_MS;
	return parsed;
}

function normalizeOriginSeeds(seeds: readonly string[]): string[] {
	return [...new Set(seeds.map((s) => s.trim()).filter((s) => s.length > 0))];
}

/** When KV is empty, write `seeds` once (deploy / local dev bootstrap). */
export async function ensureTrustedOriginsSeeded(
	kv: KVNamespace,
	seeds: readonly string[],
): Promise<string[]> {
	const normalized = normalizeOriginSeeds(seeds);
	const current = await getTrustedOrigins(kv);
	if (normalized.length === 0) {
		return current;
	}
	if (current.length === 0) {
		await setTrustedOrigins(kv, normalized);
		return normalized;
	}
	const missing = normalized.filter((origin) => !current.includes(origin));
	if (missing.length === 0) {
		return current;
	}
	const merged = [...current, ...missing];
	await setTrustedOrigins(kv, merged);
	return merged;
}

export async function setTrustedOrigins(kv: KVNamespace, origins: string[]): Promise<void> {
	await kv.put(TRUSTED_ORIGINS_KV_KEY, JSON.stringify(origins));
	bustTrustedOriginsCache();
}

export async function appendTrustedOrigin(kv: KVNamespace, origin: string): Promise<string[]> {
	const current = await getTrustedOrigins(kv);
	if (!current.includes(origin)) {
		current.push(origin);
	}
	await setTrustedOrigins(kv, current);
	return current;
}

export async function removeTrustedOrigin(kv: KVNamespace, origin: string): Promise<string[]> {
	const current = (await getTrustedOrigins(kv)).filter((o) => o !== origin);
	await setTrustedOrigins(kv, current);
	return current;
}
