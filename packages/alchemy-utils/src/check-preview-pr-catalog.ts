/**
 * Drift guard: `PREVIEW_CATALOG_DECLARATIONS` / catalogs must match `alchemy.run.ts` sources.
 *
 * Usage: `bun run --cwd packages/alchemy-utils check:preview-catalog`
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	checkPreviewPrCatalogConsistency,
	PREVIEW_CATALOG_DECLARATIONS,
	type PreviewCatalogKind,
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

function listAlchemyRunFiles(root: string): string[] {
	const out: string[] = [];
	const walk = (dir: string) => {
		let entries: ReturnType<typeof readdirSync>;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const ent of entries) {
			if (
				ent.name === "node_modules" ||
				ent.name === ".git" ||
				ent.name === ".alchemy" ||
				ent.name === "dist" ||
				ent.name === "build"
			) {
				continue;
			}
			const p = join(dir, ent.name);
			if (ent.isDirectory()) {
				walk(p);
			} else if (ent.name === "alchemy.run.ts") {
				out.push(relative(root, p).split("\\").join("/"));
			}
		}
	};
	for (const top of ["apps", "workers", "durable-objects", "packages", "stacks"]) {
		const d = join(root, top);
		if (existsSync(d)) {
			walk(d);
		}
	}
	return out.sort();
}

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

type FoundResource = { kind: PreviewCatalogKind; id: string };

/** String-literal Cloudflare resource ids. */
function literalResourceIds(src: string): FoundResource[] {
	const out: FoundResource[] = [];
	const re =
		/\b(KVNamespace|R2Bucket|D1Database|Worker|ReactRouter)\(\s*(?:DEFAULT_\w+\s*,\s*)?["']([^"']+)["']/g;
	for (const m of src.matchAll(re)) {
		const kindRaw = m[1];
		const id = m[2];
		if (!kindRaw || !id) {
			continue;
		}
		const kind: PreviewCatalogKind =
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

/** Constant-based resource ids (Worker(DEFAULT_WORKER_RESOURCE_ID, …), etc.). */
function constantResourceIds(src: string): FoundResource[] {
	const out: FoundResource[] = [];
	const patterns: Array<{ kind: PreviewCatalogKind; re: RegExp }> = [
		{
			kind: "worker",
			re: /\b(?:Worker|ReactRouter)\(\s*(DEFAULT_WORKER_RESOURCE_ID|DEFAULT_REACT_ROUTER_WEB_RESOURCE_ID)\b/g,
		},
		{
			kind: "d1",
			re: /\bD1Database\(\s*(DEFAULT_D1_DATABASE_RESOURCE_ID|DEFAULT_AUTH_D1_DATABASE_RESOURCE_ID)\b/g,
		},
		{
			kind: "kv",
			re: /\bKVNamespace\(\s*(DEFAULT_AUTH_KV_RESOURCE_ID)\b/g,
		},
	];
	for (const { kind, re } of patterns) {
		for (const m of src.matchAll(re)) {
			const constName = m[1];
			if (!constName) {
				continue;
			}
			const id = CONSTANT_VALUES[constName];
			if (id) {
				out.push({ kind, id });
			}
		}
	}
	return out;
}

function main(): void {
	const problems = [...checkPreviewPrCatalogConsistency()];
	const root = findRepoRoot();
	const alchemyFiles = listAlchemyRunFiles(root);

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

	for (const rel of alchemyFiles) {
		const abs = resolve(root, rel);
		const src = readFileSync(abs, "utf8");
		const appKey = extractAppIdKey(src);
		if (!appKey || !(appKey in ALCHEMY_APP_IDS)) {
			continue;
		}
		const appId = ALCHEMY_APP_IDS[appKey as keyof typeof ALCHEMY_APP_IDS];
		const found = [...literalResourceIds(src), ...constantResourceIds(src)];
		for (const res of found) {
			const base = `${appId}-${res.id}`;
			const declared = PREVIEW_CATALOG_DECLARATIONS.some(
				(d) =>
					d.kind === res.kind && physicalBaseForDeclaration(d).toLowerCase() === base.toLowerCase(),
			);
			if (!declared) {
				problems.push(
					`${rel}: ${res.kind} "${res.id}" ⇒ base "${base}" missing from PREVIEW_CATALOG_DECLARATIONS`,
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
	console.log(
		`[check:preview-catalog] ok — catalogs match declarations and ${alchemyFiles.length} alchemy.run.ts file(s)`,
	);
}

main();
