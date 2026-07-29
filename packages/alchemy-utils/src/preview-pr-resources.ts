/**
 * Exact Alchemy physical base names for PR preview (`STAGE=pr-<n>`) resources in this monorepo.
 *
 * Physical names are `{alchemyAppId}-{resourceId}-{stage}` (see Scope#createPhysicalName).
 * Orphan cleanup matches these catalogs — never a loose `{PRODUCT_PREFIX}-*` prefix.
 *
 * Forks: when you add a Worker / D1 / KV / R2 used on preview stages, append its base name here.
 */
import {
	ALCHEMY_APP_IDS,
	DEFAULT_AUTH_D1_DATABASE_RESOURCE_ID,
	DEFAULT_AUTH_KV_RESOURCE_ID,
	DEFAULT_D1_DATABASE_RESOURCE_ID,
	DEFAULT_REACT_ROUTER_WEB_RESOURCE_ID,
	DEFAULT_WORKER_RESOURCE_ID,
} from "./worker-peer-scripts";

/** Worker / ReactRouter script bases (Alchemy lowercases Worker script names). */
export const PREVIEW_WORKER_BASE_NAMES = [
	`${ALCHEMY_APP_IDS.frontend}-${DEFAULT_REACT_ROUTER_WEB_RESOURCE_ID}`,
	`${ALCHEMY_APP_IDS.auth}-${DEFAULT_WORKER_RESOURCE_ID}`,
	`${ALCHEMY_APP_IDS.chatroom}-${DEFAULT_WORKER_RESOURCE_ID}`,
	`${ALCHEMY_APP_IDS.posthogProxy}-${DEFAULT_WORKER_RESOURCE_ID}`,
] as const;

export const PREVIEW_D1_BASE_NAMES = [
	`${ALCHEMY_APP_IDS.database}-${DEFAULT_D1_DATABASE_RESOURCE_ID}`,
	`${ALCHEMY_APP_IDS.authDatabase}-${DEFAULT_AUTH_D1_DATABASE_RESOURCE_ID}`,
] as const;

export const PREVIEW_KV_BASE_NAMES = [
	`${ALCHEMY_APP_IDS.auth}-${DEFAULT_AUTH_KV_RESOURCE_ID}`,
] as const;

/**
 * R2 bucket bases for preview stages.
 * This template does not provision R2 on PR stages — forks append bases here when they do.
 */
export const PREVIEW_R2_BASE_NAMES = [] as const;

const STAGE_PR_SUFFIX_RE = /-pr-(\d+)$/i;

/** Parse trailing `-pr-<n>` stage suffix from an Alchemy physical name. */
export function parsePrNumberFromPhysicalName(name: string): number | undefined {
	const m = STAGE_PR_SUFFIX_RE.exec(name.trim());
	if (!m) {
		return undefined;
	}
	return Number(m[1]);
}

/** True when `name` is exactly `{base}-pr-<n>` for one of `bases` (case-insensitive). */
export function isCatalogPreviewResource(name: string, bases: readonly string[]): boolean {
	const trimmed = name.trim();
	if (!trimmed || bases.length === 0) {
		return false;
	}
	const pr = parsePrNumberFromPhysicalName(trimmed);
	if (pr === undefined) {
		return false;
	}
	const lower = trimmed.toLowerCase();
	return bases.some((base) => lower === `${base}-pr-${pr}`.toLowerCase());
}

export function isPreviewWorkerName(name: string): boolean {
	return isCatalogPreviewResource(name, PREVIEW_WORKER_BASE_NAMES);
}

export function isPreviewD1Name(name: string): boolean {
	return isCatalogPreviewResource(name, PREVIEW_D1_BASE_NAMES);
}

export function isPreviewKvTitle(name: string): boolean {
	return isCatalogPreviewResource(name, PREVIEW_KV_BASE_NAMES);
}

export function isPreviewR2Name(name: string): boolean {
	return isCatalogPreviewResource(name, PREVIEW_R2_BASE_NAMES);
}

/**
 * Durable Object namespaces are CF bindings on a Worker script (not separate Alchemy physical names).
 * Match when the namespace's `script` (or `name`) is a known preview Worker script.
 */
export function isPreviewDoNamespace(ns: {
	id?: string;
	name?: string;
	script?: string;
	class?: string;
}): boolean {
	const script = ns.script?.trim();
	if (script && isPreviewWorkerName(script)) {
		return true;
	}
	const name = ns.name?.trim();
	if (name && isPreviewWorkerName(name)) {
		return true;
	}
	return false;
}

/** Merge operator `--exclude` with open PR numbers (unless `includeOpen`). */
export function resolveCleanupExcludePrs(options: {
	manualExclude: ReadonlySet<number>;
	openPrNumbers: ReadonlySet<number>;
	includeOpen: boolean;
}): Set<number> {
	const out = new Set(options.manualExclude);
	if (!options.includeOpen) {
		for (const n of options.openPrNumbers) {
			out.add(n);
		}
	}
	return out;
}
