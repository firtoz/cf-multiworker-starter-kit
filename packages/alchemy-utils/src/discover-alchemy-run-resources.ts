/**
 * Scan `alchemy.run.ts` source for Cloudflare resource factory calls.
 * Used by `check-preview-pr-catalog` so catalogs stay in sync with Alchemy apps.
 */
import type { PreviewCatalogKind } from "./preview-pr-resources";
import {
	DEFAULT_AUTH_D1_DATABASE_RESOURCE_ID,
	DEFAULT_AUTH_KV_RESOURCE_ID,
	DEFAULT_D1_DATABASE_RESOURCE_ID,
	DEFAULT_REACT_ROUTER_WEB_RESOURCE_ID,
	DEFAULT_WORKER_RESOURCE_ID,
} from "./worker-peer-scripts";

export const ALCHEMY_RESOURCE_CONSTANT_VALUES: Record<string, string> = {
	DEFAULT_WORKER_RESOURCE_ID,
	DEFAULT_REACT_ROUTER_WEB_RESOURCE_ID,
	DEFAULT_D1_DATABASE_RESOURCE_ID,
	DEFAULT_AUTH_D1_DATABASE_RESOURCE_ID,
	DEFAULT_AUTH_KV_RESOURCE_ID,
};

export type FoundAlchemyResource = { kind: PreviewCatalogKind; id: string };

export type DiscoverAlchemyRunResourcesResult = {
	found: FoundAlchemyResource[];
	/** Factory calls whose first arg was not a string literal or known DEFAULT_* constant. */
	unresolved: Array<{ factory: string; snippet: string }>;
};

type FactoryKind = "KVNamespace" | "R2Bucket" | "D1Database" | "Worker" | "ReactRouter";

function kindForFactory(factory: FactoryKind): PreviewCatalogKind {
	if (factory === "KVNamespace") {
		return "kv";
	}
	if (factory === "R2Bucket") {
		return "r2";
	}
	if (factory === "D1Database") {
		return "d1";
	}
	return "worker";
}

function resolveConstantResourceId(
	factory: FactoryKind,
	constName: string,
): FoundAlchemyResource | undefined {
	const id = ALCHEMY_RESOURCE_CONSTANT_VALUES[constName];
	if (!id) {
		return undefined;
	}
	if (
		(factory === "Worker" || factory === "ReactRouter") &&
		(constName === "DEFAULT_WORKER_RESOURCE_ID" ||
			constName === "DEFAULT_REACT_ROUTER_WEB_RESOURCE_ID")
	) {
		return { kind: "worker", id };
	}
	if (
		factory === "D1Database" &&
		(constName === "DEFAULT_D1_DATABASE_RESOURCE_ID" ||
			constName === "DEFAULT_AUTH_D1_DATABASE_RESOURCE_ID")
	) {
		return { kind: "d1", id };
	}
	if (factory === "KVNamespace" && constName === "DEFAULT_AUTH_KV_RESOURCE_ID") {
		return { kind: "kv", id };
	}
	return undefined;
}

/**
 * After a factory identifier, skip optional TypeScript type arguments (`<…>`),
 * including nested generics. Returns the index to resume scanning from.
 */
export function skipOptionalTypeArgs(src: string, from: number): number {
	let i = from;
	while (i < src.length && /\s/.test(src.charAt(i))) {
		i++;
	}
	if (src.charAt(i) !== "<") {
		return from;
	}
	let depth = 0;
	for (; i < src.length; i++) {
		const c = src.charAt(i);
		if (c === "<") {
			depth++;
		} else if (c === ">") {
			depth--;
			if (depth === 0) {
				return i + 1;
			}
		}
	}
	return from;
}

function skipWs(src: string, from: number): number {
	let i = from;
	while (i < src.length && /\s/.test(src.charAt(i))) {
		i++;
	}
	return i;
}

/** Match `Factory` / `Factory<…>(` and return index of `(` or -1. */
function findFactoryCallOpenParen(src: string, factoryStart: number, factoryLen: number): number {
	let i = skipOptionalTypeArgs(src, factoryStart + factoryLen);
	i = skipWs(src, i);
	return src.charAt(i) === "(" ? i : -1;
}

function readStringLiteral(src: string, from: number): { value: string; end: number } | undefined {
	const q = src.charAt(from);
	if (q !== '"' && q !== "'") {
		return undefined;
	}
	let i = from + 1;
	while (i < src.length) {
		if (src.charAt(i) === "\\") {
			i += 2;
			continue;
		}
		if (src.charAt(i) === q) {
			return { value: src.slice(from + 1, i), end: i + 1 };
		}
		i++;
	}
	return undefined;
}

function readIdentifier(src: string, from: number): { value: string; end: number } | undefined {
	if (!/[A-Za-z_]/.test(src.charAt(from))) {
		return undefined;
	}
	let i = from + 1;
	while (i < src.length && /[A-Za-z0-9_]/.test(src.charAt(i))) {
		i++;
	}
	return { value: src.slice(from, i), end: i };
}

function snippetAt(src: string, from: number, len = 48): string {
	return src
		.slice(from, from + len)
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Discover resource ids from Alchemy factory calls in source text.
 * Supports optional TypeScript generics, e.g. `Worker<typeof Bindings, Rpc>(…)`.
 */
export function discoverAlchemyRunResources(src: string): DiscoverAlchemyRunResourcesResult {
	const found: FoundAlchemyResource[] = [];
	const unresolved: Array<{ factory: string; snippet: string }> = [];
	const factoryRe = /\b(KVNamespace|R2Bucket|D1Database|Worker|ReactRouter)\b/g;

	for (const m of src.matchAll(factoryRe)) {
		const factory = m[1] as FactoryKind;
		const factoryStart = m.index ?? 0;
		const open = findFactoryCallOpenParen(src, factoryStart, factory.length);
		if (open < 0) {
			continue;
		}

		const i = skipWs(src, open + 1);

		// `Factory(DEFAULT_*, "literal-id", …)` — rare; prefer the string id when present.
		const leadingIdent = readIdentifier(src, i);
		if (leadingIdent?.value.startsWith("DEFAULT_")) {
			const afterIdent = skipWs(src, leadingIdent.end);
			if (src.charAt(afterIdent) === ",") {
				const afterComma = skipWs(src, afterIdent + 1);
				const trailingStr = readStringLiteral(src, afterComma);
				if (trailingStr) {
					found.push({ kind: kindForFactory(factory), id: trailingStr.value });
					continue;
				}
			}
			const constantId = resolveConstantResourceId(factory, leadingIdent.value);
			if (constantId) {
				found.push(constantId);
			} else {
				unresolved.push({ factory, snippet: snippetAt(src, factoryStart) });
			}
			continue;
		}

		const str = readStringLiteral(src, i);
		if (str) {
			found.push({ kind: kindForFactory(factory), id: str.value });
			continue;
		}

		// Call site exists but first arg is not a resolvable literal/constant (e.g. MY_ID).
		unresolved.push({ factory, snippet: snippetAt(src, factoryStart) });
	}

	return { found, unresolved };
}
