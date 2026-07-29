/**
 * Drift guard: `PREVIEW_CATALOG_DECLARATIONS` / catalogs must match `alchemy.run.ts` sources.
 *
 * Usage: `bun run --cwd packages/alchemy-utils check:preview-catalog`
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	checkPreviewPrCatalogConsistency,
	PREVIEW_CATALOG_DECLARATIONS,
	physicalBaseForDeclaration,
} from "./preview-pr-resources";
import {
	ALCHEMY_APP_IDS,
	DEFAULT_AUTH_D1_DATABASE_RESOURCE_ID,
	DEFAULT_AUTH_KV_RESOURCE_ID,
	DEFAULT_D1_DATABASE_RESOURCE_ID,
	DEFAULT_REACT_ROUTER_WEB_RESOURCE_ID,
	DEFAULT_WORKER_RESOURCE_ID,
} from "./worker-peer-scripts";

function findRepoRoot(): string {
	const here = dirname(fileURLToPath(import.meta.url));
	const candidate = resolve(here, "../../..");
	if (existsSync(resolve(candidate, "apps/web"))) {
		return candidate;
	}
	if (existsSync(resolve(process.cwd(), "apps/web"))) {
		return process.cwd();
	}
	throw new Error("Could not locate repo root (apps/web missing)");
}

const CONSTANT_VALUES: Record<string, string> = {
	DEFAULT_WORKER_RESOURCE_ID,
	DEFAULT_REACT_ROUTER_WEB_RESOURCE_ID,
	DEFAULT_D1_DATABASE_RESOURCE_ID,
	DEFAULT_AUTH_D1_DATABASE_RESOURCE_ID,
	DEFAULT_AUTH_KV_RESOURCE_ID,
};

function extractAppIdKey(src: string): string | undefined {
	const m = /alchemy\(\s*ALCHEMY_APP_IDS\.(\w+)/.exec(src);
	return m?.[1];
}

function fileMentionsResourceId(src: string, resourceId: string): boolean {
	if (src.includes(`"${resourceId}"`) || src.includes(`'${resourceId}'`)) {
		return true;
	}
	for (const [constName, value] of Object.entries(CONSTANT_VALUES)) {
		if (value === resourceId && src.includes(constName)) {
			return true;
		}
	}
	return false;
}

/** String-literal Cloudflare resource ids that must appear in a catalog declaration for this app. */
function literalResourceIds(src: string): Array<{ kind: string; id: string }> {
	const out: Array<{ kind: string; id: string }> = [];
	const re =
		/\b(KVNamespace|R2Bucket|D1Database|Worker|ReactRouter)\(\s*(?:DEFAULT_\w+\s*,\s*)?["']([^"']+)["']/g;
	for (const m of src.matchAll(re)) {
		const kindRaw = m[1];
		const id = m[2];
		if (!kindRaw || !id) {
			continue;
		}
		const kind =
			kindRaw === "KVNamespace"
				? "kv"
				: kindRaw === "R2Bucket"
					? "r2"
					: kindRaw === "D1Database"
						? "d1"
						: "worker";
		out.push({ kind, id });
	}
	return out;
}

function main(): void {
	const problems = [...checkPreviewPrCatalogConsistency()];
	const root = findRepoRoot();

	for (const decl of PREVIEW_CATALOG_DECLARATIONS) {
		const abs = resolve(root, decl.file);
		if (!existsSync(abs)) {
			problems.push(`Missing ${decl.file} (declared in PREVIEW_CATALOG_DECLARATIONS)`);
			continue;
		}
		const src = readFileSync(abs, "utf8");
		const appKey = extractAppIdKey(src);
		if (appKey !== decl.appIdKey) {
			problems.push(
				`${decl.file}: expected alchemy(ALCHEMY_APP_IDS.${decl.appIdKey}) but found ${appKey ?? "(none)"}`,
			);
		}
		if (!fileMentionsResourceId(src, decl.resourceId)) {
			problems.push(
				`${decl.file}: resource id "${decl.resourceId}" not referenced (catalog base ${physicalBaseForDeclaration(decl)})`,
			);
		}
	}

	// Any string-literal CF resources in alchemy.run.ts must be declared.
	const alchemyFiles = new Set(PREVIEW_CATALOG_DECLARATIONS.map((d) => d.file));
	// Also scan known alchemy.run.ts paths that might add literals later.
	for (const extra of [
		"apps/web/alchemy.run.ts",
		"workers/auth-worker/alchemy.run.ts",
		"workers/posthog-proxy/alchemy.run.ts",
		"durable-objects/chatroom-do/alchemy.run.ts",
		"packages/db/alchemy.run.ts",
		"packages/auth-db/alchemy.run.ts",
		"packages/state-hub/alchemy.run.ts",
	]) {
		alchemyFiles.add(extra);
	}

	for (const rel of alchemyFiles) {
		const abs = resolve(root, rel);
		if (!existsSync(abs)) {
			continue;
		}
		const src = readFileSync(abs, "utf8");
		const appKey = extractAppIdKey(src);
		if (!appKey || !(appKey in ALCHEMY_APP_IDS)) {
			continue;
		}
		const appId = ALCHEMY_APP_IDS[appKey as keyof typeof ALCHEMY_APP_IDS];
		for (const lit of literalResourceIds(src)) {
			const base = `${appId}-${lit.id}`;
			const declared = PREVIEW_CATALOG_DECLARATIONS.some(
				(d) =>
					d.kind === lit.kind && physicalBaseForDeclaration(d).toLowerCase() === base.toLowerCase(),
			);
			if (!declared) {
				problems.push(
					`${rel}: literal ${lit.kind} "${lit.id}" ⇒ base "${base}" missing from PREVIEW_CATALOG_DECLARATIONS`,
				);
			}
		}
	}

	if (problems.length > 0) {
		console.error("[check:preview-catalog] drift detected:");
		for (const p of problems) {
			console.error(`  - ${p}`);
		}
		process.exit(1);
	}
	console.log("[check:preview-catalog] ok — catalogs match declarations and alchemy.run.ts");
}

main();
