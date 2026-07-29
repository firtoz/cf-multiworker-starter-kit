/**
 * Sweep leftover PR preview resources for this product (Cloudflare + GitHub Environments).
 *
 * Scope: exact Alchemy physical names from `alchemy-utils/preview-pr-resources` catalogs
 * (`{appId}-{resourceId}-pr-<n>`) plus GitHub `preview-pr-<n>`.
 * Never touches shared `alchemy-state-service` or other products on a shared account.
 *
 * Usage (from repo root):
 *   bun run preview:cleanup:orphans -- --exclude 22
 *   bun run preview:cleanup:orphans -- --apply
 *   bun run preview:cleanup:orphans -- --apply --include-open   # dangerous: also target open PRs
 *
 * Needs: CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID, and `gh` auth for GitHub Environments.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	isPreviewD1Name,
	isPreviewDoNamespace,
	isPreviewKvTitle,
	isPreviewR2Name,
	isPreviewWorkerName,
	parsePrNumberFromPhysicalName,
	resolveCleanupExcludePrs,
} from "alchemy-utils/preview-pr-resources";
import { PRODUCT_PREFIX } from "alchemy-utils/worker-peer-scripts";

const PREVIEW_ENV_RE = /^preview-pr-(\d+)$/;
const STATE_SERVICE = "alchemy-state-service";

type Item = {
	kind: string;
	id: string;
	label: string;
	pr: number;
};

function usage(): never {
	console.error(
		"Usage: bun run preview:cleanup:orphans -- [--exclude <n>[,n…]] [--include-open] [--apply]\n" +
			"  Default is dry-run. Pass --apply to delete.\n" +
			"  Open PRs are auto-excluded unless --include-open.\n" +
			"  --exclude adds extra PR numbers to keep (e.g. --exclude 22).",
	);
	process.exit(2);
}

function findRepoRoot(): string {
	const fromEnv = process.env["GITHUB_WORKSPACE"]?.trim();
	if (fromEnv && existsSync(resolve(fromEnv, "apps/web"))) {
		return fromEnv;
	}
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

function parseArgs(argv: string[]): {
	exclude: Set<number>;
	apply: boolean;
	includeOpen: boolean;
} {
	const exclude = new Set<number>();
	let apply = false;
	let includeOpen = false;
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--apply") {
			apply = true;
			continue;
		}
		if (a === "--include-open") {
			includeOpen = true;
			continue;
		}
		if (a === "--exclude") {
			const raw = argv[++i]?.trim();
			if (!raw) {
				usage();
			}
			for (const part of raw.split(",")) {
				const n = Number(part.trim());
				if (!Number.isInteger(n) || n <= 0) {
					usage();
				}
				exclude.add(n);
			}
			continue;
		}
		if (a === "--help" || a === "-h") {
			usage();
		}
		console.error(`Unknown argument: ${a}`);
		usage();
	}
	return { exclude, apply, includeOpen };
}

function prFromGithubEnvName(name: string): number | undefined {
	const envMatch = PREVIEW_ENV_RE.exec(name);
	if (!envMatch) {
		return undefined;
	}
	return Number(envMatch[1]);
}

type CfResultInfo = {
	page?: number;
	per_page?: number;
	count?: number;
	total_count?: number;
	total_pages?: number;
	cursor?: string;
};

async function cfApi<T>(
	method: string,
	path: string,
	accountId: string,
	token: string,
	body?: unknown,
): Promise<{
	ok: boolean;
	status: number;
	result: T | null;
	errors: unknown;
	resultInfo: CfResultInfo | null;
}> {
	const url = path.startsWith("http")
		? path
		: `https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`;
	const init: RequestInit = {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
	};
	if (body !== undefined) {
		init.body = JSON.stringify(body);
	}
	const res = await fetch(url, init);
	let json: {
		success?: boolean;
		result?: T;
		errors?: unknown;
		result_info?: CfResultInfo;
	} = {};
	try {
		json = (await res.json()) as typeof json;
	} catch {
		// empty body on some deletes
	}
	return {
		ok: res.ok && (json.success === undefined || json.success === true),
		status: res.status,
		result: (json.result ?? null) as T | null,
		errors: json.errors,
		resultInfo: json.result_info ?? null,
	};
}

async function forEachCfPage<T>(options: {
	accountId: string;
	token: string;
	pathForPage: (page: number, perPage: number) => string;
	label: string;
	perPage?: number;
	maxPages?: number;
	onPage: (rows: T[]) => void;
}): Promise<void> {
	const perPage = options.perPage ?? 100;
	const maxPages = options.maxPages ?? 100;
	for (let page = 1; page <= maxPages; page++) {
		const { ok, result, errors, resultInfo } = await cfApi<T[]>(
			"GET",
			options.pathForPage(page, perPage),
			options.accountId,
			options.token,
		);
		if (!ok || !result) {
			if (page === 1) {
				console.warn(`[cf] list ${options.label} failed`, errors);
			}
			break;
		}
		options.onPage(result);
		const totalPages = resultInfo?.total_pages;
		if (totalPages != null) {
			if (page >= totalPages) {
				break;
			}
			continue;
		}
		if (result.length < perPage) {
			break;
		}
	}
}

async function listCfWorkers(accountId: string, token: string): Promise<Item[]> {
	const items: Item[] = [];
	await forEachCfPage<{ id?: string; script_name?: string; service_name?: string }>({
		accountId,
		token,
		label: "workers",
		pathForPage: (page, perPage) =>
			`/workers/scripts-search?page=${page}&per_page=${perPage}&order_by=name`,
		onPage: (rows) => {
			for (const s of rows) {
				const id = (s.script_name ?? s.service_name ?? s.id)?.trim();
				if (!id || id.includes(STATE_SERVICE) || !isPreviewWorkerName(id)) {
					continue;
				}
				const pr = parsePrNumberFromPhysicalName(id);
				if (pr === undefined) {
					continue;
				}
				items.push({ kind: "worker", id, label: id, pr });
			}
		},
	});
	return items;
}

async function listCfD1(accountId: string, token: string): Promise<Item[]> {
	const items: Item[] = [];
	await forEachCfPage<{ uuid?: string; name?: string }>({
		accountId,
		token,
		label: "D1",
		pathForPage: (page, perPage) => `/d1/database?page=${page}&per_page=${perPage}`,
		onPage: (rows) => {
			for (const db of rows) {
				const name = db.name?.trim();
				const uuid = db.uuid?.trim();
				if (!name || !uuid || !isPreviewD1Name(name)) {
					continue;
				}
				const pr = parsePrNumberFromPhysicalName(name);
				if (pr === undefined) {
					continue;
				}
				items.push({ kind: "d1", id: uuid, label: name, pr });
			}
		},
	});
	return items;
}

async function listCfR2(accountId: string, token: string): Promise<Item[]> {
	const items: Item[] = [];
	let cursor: string | undefined;
	for (let page = 0; page < 100; page++) {
		const q = new URLSearchParams({ per_page: "100" });
		if (cursor) {
			q.set("cursor", cursor);
		}
		const { ok, result, errors, resultInfo } = await cfApi<{
			buckets?: Array<{ name?: string }>;
		}>("GET", `/r2/buckets?${q}`, accountId, token);
		const buckets = result?.buckets ?? (Array.isArray(result) ? result : null);
		if (!ok || !buckets) {
			if (page === 0) {
				console.warn("[cf] list R2 failed", errors);
			}
			break;
		}
		for (const b of buckets as Array<{ name?: string }>) {
			const name = b.name?.trim();
			if (!name || !isPreviewR2Name(name)) {
				continue;
			}
			const pr = parsePrNumberFromPhysicalName(name);
			if (pr === undefined) {
				continue;
			}
			items.push({ kind: "r2", id: name, label: name, pr });
		}
		cursor = resultInfo?.cursor?.trim() || undefined;
		if (!cursor) {
			break;
		}
	}
	return items;
}

async function listCfKv(accountId: string, token: string): Promise<Item[]> {
	const items: Item[] = [];
	await forEachCfPage<{ id?: string; title?: string }>({
		accountId,
		token,
		label: "KV",
		pathForPage: (page, perPage) => `/storage/kv/namespaces?page=${page}&per_page=${perPage}`,
		onPage: (rows) => {
			for (const ns of rows) {
				const title = ns.title?.trim();
				const id = ns.id?.trim();
				if (!title || !id || !isPreviewKvTitle(title)) {
					continue;
				}
				const pr = parsePrNumberFromPhysicalName(title);
				if (pr === undefined) {
					continue;
				}
				items.push({ kind: "kv", id, label: title, pr });
			}
		},
	});
	return items;
}

async function listCfDoNamespaces(accountId: string, token: string): Promise<Item[]> {
	const items: Item[] = [];
	await forEachCfPage<{ id?: string; name?: string; script?: string; class?: string }>({
		accountId,
		token,
		label: "DO namespaces",
		pathForPage: (page, perPage) =>
			`/workers/durable_objects/namespaces?page=${page}&per_page=${perPage}`,
		onPage: (rows) => {
			for (const ns of rows) {
				const id = ns.id?.trim();
				if (!id || !isPreviewDoNamespace(ns)) {
					continue;
				}
				const scriptOrName = (ns.script ?? ns.name ?? "").trim();
				const pr = parsePrNumberFromPhysicalName(scriptOrName);
				if (pr === undefined) {
					continue;
				}
				items.push({
					kind: "do-namespace",
					id,
					label: scriptOrName || id,
					pr,
				});
			}
		},
	});
	return items;
}

function listGithubPreviewEnvs(): Item[] {
	const result = spawnSync(
		"gh",
		["api", "repos/{owner}/{repo}/environments", "--paginate", "--jq", ".environments[].name"],
		{ encoding: "utf8", env: process.env, maxBuffer: 8 * 1024 * 1024 },
	);
	if (result.status !== 0) {
		console.warn(
			"[gh] list environments failed:",
			result.stderr?.trim() || `exit ${result.status}`,
		);
		return [];
	}
	const items: Item[] = [];
	for (const line of (result.stdout ?? "").split("\n")) {
		const name = line.trim();
		if (!PREVIEW_ENV_RE.test(name)) {
			continue;
		}
		const pr = prFromGithubEnvName(name);
		if (pr === undefined) {
			continue;
		}
		items.push({ kind: "gh-environment", id: name, label: name, pr });
	}
	return items;
}

function listOpenPullRequestNumbers(): { ok: boolean; numbers: Set<number> } {
	const result = spawnSync(
		"gh",
		["pr", "list", "--state", "open", "--limit", "1000", "--json", "number", "--jq", ".[].number"],
		{ encoding: "utf8", env: process.env, maxBuffer: 8 * 1024 * 1024 },
	);
	const numbers = new Set<number>();
	if (result.status !== 0) {
		console.warn("[gh] list open PRs failed:", result.stderr?.trim() || `exit ${result.status}`);
		return { ok: false, numbers };
	}
	for (const line of (result.stdout ?? "").split("\n")) {
		const n = Number(line.trim());
		if (Number.isInteger(n) && n > 0) {
			numbers.add(n);
		}
	}
	return { ok: true, numbers };
}

async function emptyR2Bucket(accountId: string, token: string, bucket: string): Promise<boolean> {
	let cursor: string | undefined;
	for (let page = 0; page < 500; page++) {
		const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
		const listed = await cfApi<{
			objects?: Array<{ key?: string }>;
			truncated_after?: string;
		}>("GET", `/r2/buckets/${encodeURIComponent(bucket)}/objects${q}`, accountId, token);
		if (!listed.ok) {
			console.warn(
				`\n    list objects in ${bucket} failed: ${JSON.stringify(listed.errors ?? listed.status)}`,
			);
			return false;
		}
		const objects = listed.result?.objects ?? [];
		if (objects.length === 0) {
			return true;
		}
		for (const obj of objects) {
			const key = obj.key;
			if (!key) {
				continue;
			}
			const del = await cfApi(
				"DELETE",
				`/r2/buckets/${encodeURIComponent(bucket)}/objects/${encodeURIComponent(key)}`,
				accountId,
				token,
			);
			if (!del.ok && del.status !== 404) {
				console.warn(
					`\n    delete object ${key} in ${bucket} failed: ${JSON.stringify(del.errors ?? del.status)}`,
				);
				return false;
			}
		}
		cursor = listed.result?.truncated_after;
		if (!cursor) {
			return true;
		}
	}
	console.warn(`\n    empty ${bucket}: hit object page cap with cursor still set`);
	return false;
}

/** Clear service bindings so circular Worker refs do not block DELETE. */
async function stripWorkerBindings(
	accountId: string,
	token: string,
	scriptName: string,
): Promise<boolean> {
	const stub =
		'export default { async fetch() { return new Response("gone", { status: 410 }); } };\n';
	const meta = JSON.stringify({
		main_module: "index.js",
		bindings: [],
		compatibility_date: "2024-01-01",
	});
	const boundary = `----cfboundary${Date.now()}`;
	const body = [
		`--${boundary}`,
		'Content-Disposition: form-data; name="metadata"',
		"Content-Type: application/json",
		"",
		meta,
		`--${boundary}`,
		'Content-Disposition: form-data; name="index.js"; filename="index.js"',
		"Content-Type: application/javascript+module",
		"",
		stub,
		`--${boundary}--`,
		"",
	].join("\r\n");
	const res = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}`,
		{
			method: "PUT",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": `multipart/form-data; boundary=${boundary}`,
			},
			body,
		},
	);
	let json: { success?: boolean; errors?: unknown } = {};
	try {
		json = (await res.json()) as typeof json;
	} catch {
		// ignore
	}
	if (!(res.ok && (json.success === undefined || json.success === true))) {
		console.warn(`\n    strip ${scriptName} failed: ${JSON.stringify(json.errors ?? res.status)}`);
		return false;
	}
	return true;
}

async function deleteItem(
	item: Item,
	accountId: string | undefined,
	cfToken: string | undefined,
): Promise<boolean> {
	switch (item.kind) {
		case "worker": {
			if (!accountId || !cfToken) {
				return false;
			}
			await stripWorkerBindings(accountId, cfToken, item.id);
			const r = await cfApi(
				"DELETE",
				`/workers/scripts/${encodeURIComponent(item.id)}`,
				accountId,
				cfToken,
			);
			if (!r.ok && r.status !== 404) {
				console.warn(`\n    cf delete worker errors: ${JSON.stringify(r.errors)}`);
			}
			return r.ok || r.status === 404;
		}
		case "d1": {
			if (!accountId || !cfToken) {
				return false;
			}
			const r = await cfApi(
				"DELETE",
				`/d1/database/${encodeURIComponent(item.id)}`,
				accountId,
				cfToken,
			);
			return r.ok || r.status === 404;
		}
		case "r2": {
			if (!accountId || !cfToken) {
				return false;
			}
			const emptied = await emptyR2Bucket(accountId, cfToken, item.id);
			if (!emptied) {
				return false;
			}
			const r = await cfApi(
				"DELETE",
				`/r2/buckets/${encodeURIComponent(item.id)}`,
				accountId,
				cfToken,
			);
			return r.ok || r.status === 404;
		}
		case "kv": {
			if (!accountId || !cfToken) {
				return false;
			}
			const r = await cfApi(
				"DELETE",
				`/storage/kv/namespaces/${encodeURIComponent(item.id)}`,
				accountId,
				cfToken,
			);
			return r.ok || r.status === 404;
		}
		case "do-namespace": {
			if (!accountId || !cfToken) {
				return false;
			}
			const r = await cfApi(
				"DELETE",
				`/workers/durable_objects/namespaces/${encodeURIComponent(item.id)}`,
				accountId,
				cfToken,
			);
			return r.ok || r.status === 404;
		}
		case "gh-environment": {
			const list = spawnSync(
				"gh",
				[
					"api",
					"--paginate",
					`repos/{owner}/{repo}/deployments?environment=${encodeURIComponent(item.id)}&per_page=100`,
					"--jq",
					".[].id",
				],
				{ encoding: "utf8", env: process.env, maxBuffer: 8 * 1024 * 1024 },
			);
			for (const line of (list.stdout ?? "").split("\n")) {
				const id = line.trim();
				if (!id) {
					continue;
				}
				spawnSync(
					"gh",
					[
						"api",
						"-X",
						"POST",
						`repos/{owner}/{repo}/deployments/${id}/statuses`,
						"-f",
						"state=inactive",
						"-f",
						"description=Orphan preview cleanup",
					],
					{ encoding: "utf8", env: process.env },
				);
			}
			const del = spawnSync(
				"gh",
				["api", "-X", "DELETE", `repos/{owner}/{repo}/environments/${encodeURIComponent(item.id)}`],
				{ encoding: "utf8", env: process.env },
			);
			return del.status === 0 || (del.stderr ?? "").toLowerCase().includes("404");
		}
		default:
			console.warn(`Unknown kind ${item.kind}`);
			return false;
	}
}

function itemKey(item: Item): string {
	return `${item.kind}:${item.id}`;
}

async function main(): Promise<void> {
	const { exclude: manualExclude, apply, includeOpen } = parseArgs(process.argv.slice(2));
	findRepoRoot(); // validate cwd / workspace

	const openListed = listOpenPullRequestNumbers();
	if (apply && !includeOpen && !openListed.ok) {
		console.error(
			"[preview-cleanup-orphans] --apply aborted: could not list open PRs (pass --include-open only if intentional)",
		);
		process.exit(1);
	}
	const openPrNumbers = openListed.numbers;

	const exclude = resolveCleanupExcludePrs({
		manualExclude,
		openPrNumbers,
		includeOpen,
	});

	const mode = apply ? "APPLY" : "DRY-RUN";
	console.log(
		`[preview-cleanup-orphans] product=${PRODUCT_PREFIX} mode=${mode} includeOpen=${includeOpen} exclude=[${[...exclude].sort((a, b) => a - b).join(",")}]`,
	);
	if (!includeOpen && openPrNumbers.size > 0) {
		console.log(
			`[preview-cleanup-orphans] auto-excluding open PR(s): ${[...openPrNumbers].sort((a, b) => a - b).join(", ")}`,
		);
	}

	const accountId = process.env["CLOUDFLARE_ACCOUNT_ID"]?.trim();
	const cfToken = process.env["CLOUDFLARE_API_TOKEN"]?.trim();

	const discovered: Item[] = [];

	if (accountId && cfToken) {
		discovered.push(
			...(await listCfWorkers(accountId, cfToken)),
			...(await listCfD1(accountId, cfToken)),
			...(await listCfR2(accountId, cfToken)),
			...(await listCfKv(accountId, cfToken)),
			...(await listCfDoNamespaces(accountId, cfToken)),
		);
	} else {
		console.warn(
			"[cf] CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN unset — skipping Cloudflare scan",
		);
	}

	discovered.push(...listGithubPreviewEnvs());

	const filtered = discovered
		.filter((item) => !exclude.has(item.pr))
		.sort((a, b) => a.pr - b.pr || a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label));

	if (filtered.length === 0) {
		console.log("[preview-cleanup-orphans] nothing to clean (after excludes)");
		return;
	}

	console.log(`[preview-cleanup-orphans] ${filtered.length} target(s):`);
	for (const item of filtered) {
		console.log(`  - [${item.kind}] pr-${item.pr}  ${item.label}`);
	}

	if (!apply) {
		console.log("[preview-cleanup-orphans] dry-run complete — re-run with --apply to delete");
		return;
	}

	const succeeded = new Set<string>();
	const failed = new Set<string>();
	const failedWorkers: Item[] = [];

	// Strip Worker bindings first so circular service refs do not block DELETE.
	const workers = filtered.filter((i) => i.kind === "worker");
	const rest = filtered.filter((i) => i.kind !== "worker");
	if (accountId && cfToken && workers.length > 0) {
		console.log(`[preview-cleanup-orphans] stripping bindings on ${workers.length} worker(s)…`);
		for (const w of workers) {
			const ok = await stripWorkerBindings(accountId, cfToken, w.id);
			console.log(`  strip ${w.label}: ${ok ? "ok" : "FAILED"}`);
		}
	}

	for (const item of [...rest, ...workers]) {
		const key = itemKey(item);
		process.stdout.write(`  deleting [${item.kind}] ${item.label} … `);
		try {
			const ok = await deleteItem(item, accountId, cfToken);
			if (ok) {
				succeeded.add(key);
				failed.delete(key);
				console.log("ok");
			} else {
				failed.add(key);
				if (item.kind === "worker") {
					failedWorkers.push(item);
				}
				console.log("FAILED");
			}
		} catch (error) {
			failed.add(key);
			if (item.kind === "worker") {
				failedWorkers.push(item);
			}
			console.log(`FAILED (${String(error)})`);
		}
	}

	// Second pass only for workers that failed (bindings peers may have cleared).
	if (failedWorkers.length > 0 && accountId && cfToken) {
		console.log("[preview-cleanup-orphans] retrying worker deletes…");
		for (const item of failedWorkers) {
			const key = itemKey(item);
			process.stdout.write(`  retry delete ${item.label} … `);
			const ok = await deleteItem(item, accountId, cfToken);
			if (ok) {
				succeeded.add(key);
				failed.delete(key);
				console.log("ok");
			} else {
				failed.add(key);
				console.log("FAILED");
			}
		}
	}

	const okCount = succeeded.size;
	const failCount = failed.size;
	console.log(`[preview-cleanup-orphans] done — deleted=${okCount} failed=${failCount}`);
	if (failCount > 0) {
		process.exit(1);
	}
}

await main();
