/**
 * Exact Alchemy physical base names for PR preview (`STAGE=pr-<n>`) resources in this monorepo.
 *
 * Physical names are `{alchemyAppId}-{resourceId}-{stage}` (see Scope#createPhysicalName).
 * Orphan cleanup matches these catalogs — never a loose `{PRODUCT_PREFIX}-*` prefix.
 *
 * Forks: when you add a Worker / D1 / KV / R2 used on preview stages, append its base name here
 * and keep `checkPreviewPrCatalogConsistency()` / `bun run check:preview-catalog` green.
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

export type PreviewCatalogKind = "worker" | "d1" | "kv" | "r2";

/** Declared preview resources derived from each package's `alchemy.run.ts` (for drift checks). */
export type PreviewCatalogDeclaration = {
	readonly file: string;
	readonly appIdKey: keyof typeof ALCHEMY_APP_IDS;
	readonly kind: PreviewCatalogKind;
	/** Resource id passed to Worker/D1/KV/R2/ReactRouter (constant name or literal). */
	readonly resourceId: string;
};

/**
 * Source-of-truth declarations that must stay in sync with `alchemy.run.ts` files.
 * When you add a preview-stage Cloudflare resource, append here and to the matching catalog array.
 */
export const PREVIEW_CATALOG_DECLARATIONS: readonly PreviewCatalogDeclaration[] = [
	{
		file: "apps/web/alchemy.run.ts",
		appIdKey: "frontend",
		kind: "worker",
		resourceId: DEFAULT_REACT_ROUTER_WEB_RESOURCE_ID,
	},
	{
		file: "workers/auth-worker/alchemy.run.ts",
		appIdKey: "auth",
		kind: "worker",
		resourceId: DEFAULT_WORKER_RESOURCE_ID,
	},
	{
		file: "workers/auth-worker/alchemy.run.ts",
		appIdKey: "auth",
		kind: "kv",
		resourceId: DEFAULT_AUTH_KV_RESOURCE_ID,
	},
	{
		file: "durable-objects/chatroom-do/alchemy.run.ts",
		appIdKey: "chatroom",
		kind: "worker",
		resourceId: DEFAULT_WORKER_RESOURCE_ID,
	},
	{
		file: "workers/posthog-proxy/alchemy.run.ts",
		appIdKey: "posthogProxy",
		kind: "worker",
		resourceId: DEFAULT_WORKER_RESOURCE_ID,
	},
	{
		file: "packages/db/alchemy.run.ts",
		appIdKey: "database",
		kind: "d1",
		resourceId: DEFAULT_D1_DATABASE_RESOURCE_ID,
	},
	{
		file: "packages/auth-db/alchemy.run.ts",
		appIdKey: "authDatabase",
		kind: "d1",
		resourceId: DEFAULT_AUTH_D1_DATABASE_RESOURCE_ID,
	},
] as const;

export function physicalBaseForDeclaration(decl: PreviewCatalogDeclaration): string {
	return `${ALCHEMY_APP_IDS[decl.appIdKey]}-${decl.resourceId}`;
}

export function catalogBasesForKind(kind: PreviewCatalogKind): readonly string[] {
	switch (kind) {
		case "worker":
			return PREVIEW_WORKER_BASE_NAMES;
		case "d1":
			return PREVIEW_D1_BASE_NAMES;
		case "kv":
			return PREVIEW_KV_BASE_NAMES;
		case "r2":
			return PREVIEW_R2_BASE_NAMES;
	}
}

/**
 * Ensure every declaration's physical base is present in the kind catalog (and catalogs have no extras).
 * Returns human-readable problems (empty = ok).
 */
export function checkPreviewPrCatalogConsistency(): string[] {
	const problems: string[] = [];
	const expectedByKind: Record<PreviewCatalogKind, Set<string>> = {
		worker: new Set(),
		d1: new Set(),
		kv: new Set(),
		r2: new Set(),
	};

	for (const decl of PREVIEW_CATALOG_DECLARATIONS) {
		const base = physicalBaseForDeclaration(decl);
		expectedByKind[decl.kind].add(base);
		const catalog = catalogBasesForKind(decl.kind);
		if (!catalog.map((b) => b.toLowerCase()).includes(base.toLowerCase())) {
			problems.push(
				`${decl.file}: ${decl.kind} base "${base}" missing from PREVIEW_${decl.kind.toUpperCase()}_BASE_NAMES`,
			);
		}
	}

	for (const kind of ["worker", "d1", "kv", "r2"] as const) {
		const catalog = catalogBasesForKind(kind);
		const expected = expectedByKind[kind];
		for (const base of catalog) {
			if (![...expected].some((e) => e.toLowerCase() === base.toLowerCase())) {
				problems.push(
					`PREVIEW_${kind.toUpperCase()}_BASE_NAMES has "${base}" with no PREVIEW_CATALOG_DECLARATIONS entry`,
				);
			}
		}
	}

	return problems;
}
