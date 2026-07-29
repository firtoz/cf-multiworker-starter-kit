/**
 * Sweep leftover PR preview resources for this product (Cloudflare + GitHub Environments).
 *
 * Scope: only names matching `{PRODUCT_PREFIX}-…-pr-<n>` and GitHub `preview-pr-<n>`.
 * Never touches shared `alchemy-state-service` or other products’ leftovers on a shared account.
 *
 * Usage (from repo root):
 *   bun run preview:cleanup:orphans -- --exclude 22
 *   bun run preview:cleanup:orphans -- --apply
 *
 * Needs: CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID, and `gh` auth for GitHub Environments.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PRODUCT_PREFIX } from "alchemy-utils/worker-peer-scripts";

const PR_IN_NAME_RE = /(?:^|[-_])pr-(\d+)(?:$|[-_])/i;
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
		"Usage: bun run preview:cleanup:orphans -- [--exclude <n>[,n…]] [--apply]\n" +
			"  Default is dry-run. Pass --apply to delete.\n" +
			"  --exclude keeps live open PR stacks (e.g. --exclude 22).",
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

function parseArgs(argv: string[]): { exclude: Set<number>; apply: boolean } {
	const exclude = new Set<number>();
	let apply = false;
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--apply") {
			apply = true;
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
	return { exclude, apply };
}

function prFromName(name: string): number | undefined {
	const envMatch = PREVIEW_ENV_RE.exec(name);
	if (envMatch) {
		return Number(envMatch[1]);
	}
	const m = PR_IN_NAME_RE.exec(name);
	if (!m) {
		return undefined;
	}
	return Number(m[1]);
}

/** Cloudflare resources only — requires `{PRODUCT_PREFIX}-…-pr-<n>`. GitHub `preview-pr-<n>` is matched separately. */
function isProductPrResource(name: string): boolean {
	if (!name || name === STATE_SERVICE || name.includes(STATE_SERVICE)) {
		return false;
	}
	return name.startsWith(`${PRODUCT_PREFIX}-`) && PR_IN_NAME_RE.test(name);
}

type CfResultInfo = {
	page?: number;
	per_page?: number;
	count?: number;
	total_count?: number;
	total_pages?: number;
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

async function listCfWorkers(accountId: string, token: string): Promise<Item[]> {
	const { ok, result, errors } = await cfApi<Array<{ id?: string }>>(
		"GET",
		"/workers/scripts",
		accountId,
		token,
	);
	if (!ok || !result) {
		console.warn("[cf] list workers failed", errors);
		return [];
	}
	const items: Item[] = [];
	for (const s of result) {
		const id = s.id?.trim();
		if (!id || !isProductPrResource(id)) {
			continue;
		}
		const pr = prFromName(id);
		if (pr === undefined) {
			continue;
		}
		items.push({ kind: "worker", id, label: id, pr });
	}
	return items;
}

async function listCfD1(accountId: string, token: string): Promise<Item[]> {
	const items: Item[] = [];
	const perPage = 100;
	const maxPages = 100;
	for (let page = 1; page <= maxPages; page++) {
		const { ok, result, errors, resultInfo } = await cfApi<Array<{ uuid?: string; name?: string }>>(
			"GET",
			`/d1/database?page=${page}&per_page=${perPage}`,
			accountId,
			token,
		);
		if (!ok || !result) {
			if (page === 1) {
				console.warn("[cf] list D1 failed", errors);
			}
			break;
		}
		for (const db of result) {
			const name = db.name?.trim();
			const uuid = db.uuid?.trim();
			if (!name || !uuid || !isProductPrResource(name)) {
				continue;
			}
			const pr = prFromName(name);
			if (pr === undefined) {
				continue;
			}
			items.push({ kind: "d1", id: uuid, label: name, pr });
		}
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
	return items;
}

async function listCfR2(accountId: string, token: string): Promise<Item[]> {
	const { ok, result, errors } = await cfApi<{ buckets?: Array<{ name?: string }> }>(
		"GET",
		"/r2/buckets",
		accountId,
		token,
	);
	const buckets = result?.buckets ?? (Array.isArray(result) ? result : null);
	if (!ok || !buckets) {
		console.warn("[cf] list R2 failed", errors);
		return [];
	}
	const items: Item[] = [];
	for (const b of buckets as Array<{ name?: string }>) {
		const name = b.name?.trim();
		if (!name || !isProductPrResource(name)) {
			continue;
		}
		const pr = prFromName(name);
		if (pr === undefined) {
			continue;
		}
		items.push({ kind: "r2", id: name, label: name, pr });
	}
	return items;
}

async function listCfKv(accountId: string, token: string): Promise<Item[]> {
	const { ok, result, errors } = await cfApi<Array<{ id?: string; title?: string }>>(
		"GET",
		"/storage/kv/namespaces?per_page=100",
		accountId,
		token,
	);
	if (!ok || !result) {
		console.warn("[cf] list KV failed", errors);
		return [];
	}
	const items: Item[] = [];
	for (const ns of result) {
		const title = ns.title?.trim();
		const id = ns.id?.trim();
		if (!title || !id || !isProductPrResource(title)) {
			continue;
		}
		const pr = prFromName(title);
		if (pr === undefined) {
			continue;
		}
		items.push({ kind: "kv", id, label: title, pr });
	}
	return items;
}

async function listCfDoNamespaces(accountId: string, token: string): Promise<Item[]> {
	const { ok, result, errors } = await cfApi<
		Array<{ id?: string; name?: string; script?: string }>
	>("GET", "/workers/durable_objects/namespaces", accountId, token);
	if (!ok || !result) {
		console.warn("[cf] list DO namespaces failed", errors);
		return [];
	}
	const items: Item[] = [];
	for (const ns of result) {
		const name = ns.name?.trim();
		const id = ns.id?.trim();
		if (!name || !id || !isProductPrResource(name)) {
			continue;
		}
		const pr = prFromName(name);
		if (pr === undefined) {
			continue;
		}
		items.push({ kind: "do-namespace", id, label: name, pr });
	}
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
		const pr = prFromName(name);
		if (pr === undefined) {
			continue;
		}
		items.push({ kind: "gh-environment", id: name, label: name, pr });
	}
	return items;
}

async function emptyR2Bucket(accountId: string, token: string, bucket: string): Promise<void> {
	let cursor: string | undefined;
	for (let page = 0; page < 50; page++) {
		const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
		const listed = await cfApi<{
			objects?: Array<{ key?: string }>;
			truncated_after?: string;
		}>("GET", `/r2/buckets/${encodeURIComponent(bucket)}/objects${q}`, accountId, token);
		const objects = listed.result?.objects ?? [];
		if (objects.length === 0) {
			break;
		}
		for (const obj of objects) {
			const key = obj.key;
			if (!key) {
				continue;
			}
			await cfApi(
				"DELETE",
				`/r2/buckets/${encodeURIComponent(bucket)}/objects/${encodeURIComponent(key)}`,
				accountId,
				token,
			);
		}
		cursor = listed.result?.truncated_after;
		if (!cursor) {
			break;
		}
	}
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
			await emptyR2Bucket(accountId, cfToken, item.id);
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
					`repos/{owner}/{repo}/deployments?environment=${encodeURIComponent(item.id)}&per_page=100`,
					"--jq",
					".[].id",
				],
				{ encoding: "utf8", env: process.env },
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

async function main(): Promise<void> {
	const { exclude, apply } = parseArgs(process.argv.slice(2));
	findRepoRoot(); // validate cwd / workspace
	const mode = apply ? "APPLY" : "DRY-RUN";
	console.log(
		`[preview-cleanup-orphans] product=${PRODUCT_PREFIX} mode=${mode} exclude=[${[...exclude].sort((a, b) => a - b).join(",")}]`,
	);

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

	let okCount = 0;
	let failCount = 0;
	const failedWorkers: Item[] = [];

	// Strip Worker bindings first so circular service refs do not block DELETE.
	const workers = filtered.filter((i) => i.kind === "worker");
	const rest = filtered.filter((i) => i.kind !== "worker");
	if (apply && accountId && cfToken && workers.length > 0) {
		console.log(`[preview-cleanup-orphans] stripping bindings on ${workers.length} worker(s)…`);
		for (const w of workers) {
			const ok = await stripWorkerBindings(accountId, cfToken, w.id);
			console.log(`  strip ${w.label}: ${ok ? "ok" : "FAILED"}`);
		}
	}

	for (const item of [...rest, ...workers]) {
		process.stdout.write(`  deleting [${item.kind}] ${item.label} … `);
		try {
			const ok = await deleteItem(item, accountId, cfToken);
			if (ok) {
				okCount += 1;
				console.log("ok");
			} else {
				failCount += 1;
				if (item.kind === "worker") {
					failedWorkers.push(item);
				}
				console.log("FAILED");
			}
		} catch (error) {
			failCount += 1;
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
			process.stdout.write(`  retry delete ${item.label} … `);
			const ok = await deleteItem(item, accountId, cfToken);
			if (ok) {
				failCount = Math.max(0, failCount - 1);
				okCount += 1;
				console.log("ok");
			} else {
				console.log("FAILED");
			}
		}
	}

	console.log(`[preview-cleanup-orphans] done — deleted=${okCount} failed=${failCount}`);
	if (failCount > 0) {
		process.exit(1);
	}
}

await main();
