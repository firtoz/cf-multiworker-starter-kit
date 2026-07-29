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
	PREVIEW_R2_BASE_NAMES,
	parsePrNumberFromPhysicalName,
	resolveCleanupExcludePrs,
} from "alchemy-utils/preview-pr-resources";
import { PRODUCT_PREFIX } from "alchemy-utils/worker-peer-scripts";

const PREVIEW_ENV_RE = /^preview-pr-(\d+)$/;
const STATE_SERVICE = "alchemy-state-service";
const OPEN_PR_PAGE_SIZE = 100;

type Item = {
	kind: string;
	id: string;
	label: string;
	pr: number;
};

type ListResult = {
	items: Item[];
	/** False when the scan failed or stopped early (partial page). */
	complete: boolean;
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
}): Promise<{ complete: boolean }> {
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
			console.warn(
				`[cf] list ${options.label} failed on page ${page}`,
				errors ?? `(status incomplete)`,
			);
			return { complete: false };
		}
		if (!Array.isArray(result)) {
			console.warn(`[cf] list ${options.label}: expected array result on page ${page}`);
			return { complete: false };
		}
		options.onPage(result);
		const totalPages = resultInfo?.total_pages;
		if (totalPages != null) {
			if (page >= totalPages) {
				return { complete: true };
			}
			continue;
		}
		if (result.length < perPage) {
			return { complete: true };
		}
	}
	console.warn(`[cf] list ${options.label}: hit page cap (${maxPages}) with more results likely`);
	return { complete: false };
}

function collectWorkerItems(
	rows: Array<{ id?: string; script_name?: string; service_name?: string }>,
	useClassicIdAsName: boolean,
): Item[] {
	const items: Item[] = [];
	for (const s of rows) {
		const id = (
			useClassicIdAsName
				? (s.id ?? s.script_name ?? s.service_name)
				: (s.script_name ?? s.service_name ?? s.id)
		)?.trim();
		if (!id || id.includes(STATE_SERVICE) || !isPreviewWorkerName(id)) {
			continue;
		}
		const pr = parsePrNumberFromPhysicalName(id);
		if (pr === undefined) {
			continue;
		}
		items.push({ kind: "worker", id, label: id, pr });
	}
	return items;
}

async function listCfWorkers(accountId: string, token: string): Promise<ListResult> {
	const items: Item[] = [];
	const search = await forEachCfPage<{
		id?: string;
		script_name?: string;
		service_name?: string;
	}>({
		accountId,
		token,
		label: "workers (scripts-search)",
		pathForPage: (page, perPage) =>
			`/workers/scripts-search?page=${page}&per_page=${perPage}&order_by=name`,
		onPage: (rows) => {
			items.push(...collectWorkerItems(rows, false));
		},
	});
	if (search.complete) {
		return { items, complete: true };
	}

	console.warn("[cf] scripts-search incomplete — falling back to /workers/scripts");
	items.length = 0;
	const classic = await cfApi<Array<{ id?: string; script_name?: string; service_name?: string }>>(
		"GET",
		"/workers/scripts",
		accountId,
		token,
	);
	if (!classic.ok || !classic.result || !Array.isArray(classic.result)) {
		console.warn("[cf] list workers fallback failed", classic.errors);
		return { items, complete: false };
	}
	items.push(...collectWorkerItems(classic.result, true));
	// Classic list is historically unpaginated (full set). Treat as complete when ok.
	return { items, complete: true };
}

async function listCfD1(accountId: string, token: string): Promise<ListResult> {
	const items: Item[] = [];
	const page = await forEachCfPage<{ uuid?: string; name?: string }>({
		accountId,
		token,
		label: "D1",
		pathForPage: (p, perPage) => `/d1/database?page=${p}&per_page=${perPage}`,
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
	return { items, complete: page.complete };
}

async function listCfR2(accountId: string, token: string): Promise<ListResult> {
	if (PREVIEW_R2_BASE_NAMES.length === 0) {
		return { items: [], complete: true };
	}
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
			console.warn(`[cf] list R2 failed on page ${page + 1}`, errors);
			return { items, complete: false };
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
			return { items, complete: true };
		}
	}
	console.warn("[cf] list R2: hit page cap with cursor still set");
	return { items, complete: false };
}

async function listCfKv(accountId: string, token: string): Promise<ListResult> {
	const items: Item[] = [];
	const page = await forEachCfPage<{ id?: string; title?: string }>({
		accountId,
		token,
		label: "KV",
		pathForPage: (p, perPage) => `/storage/kv/namespaces?page=${p}&per_page=${perPage}`,
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
	return { items, complete: page.complete };
}

async function listCfDoNamespaces(accountId: string, token: string): Promise<ListResult> {
	const items: Item[] = [];
	const page = await forEachCfPage<{
		id?: string;
		name?: string;
		script?: string;
		class?: string;
	}>({
		accountId,
		token,
		label: "DO namespaces",
		pathForPage: (p, perPage) =>
			`/workers/durable_objects/namespaces?page=${p}&per_page=${perPage}`,
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
	return { items, complete: page.complete };
}

/** Parse `gh api --paginate` stdout: one JSON value, NDJSON pages, or concatenated arrays. */
function parseGhPaginatedJson(stdout: string): unknown[] {
	const raw = stdout.trim();
	if (!raw) {
		return [];
	}
	try {
		const once = JSON.parse(raw) as unknown;
		return Array.isArray(once) ? once : [once];
	} catch {
		// continue
	}
	const pages: unknown[] = [];
	const chunks = raw.split(/\n(?=\{)/);
	for (const chunk of chunks) {
		const t = chunk.trim();
		if (!t) {
			continue;
		}
		try {
			pages.push(JSON.parse(t) as unknown);
		} catch {
			console.warn("[gh] could not parse paginated JSON chunk");
			return [];
		}
	}
	return pages;
}

function listGithubPreviewEnvs(): ListResult {
	const result = spawnSync("gh", ["api", "repos/{owner}/{repo}/environments", "--paginate"], {
		encoding: "utf8",
		env: process.env,
		maxBuffer: 8 * 1024 * 1024,
	});
	if (result.status !== 0) {
		console.warn(
			"[gh] list environments failed:",
			result.stderr?.trim() || `exit ${result.status}`,
		);
		return { items: [], complete: false };
	}
	const pages = parseGhPaginatedJson(result.stdout ?? "");
	if (pages.length === 0 && (result.stdout ?? "").trim().length > 0) {
		return { items: [], complete: false };
	}
	const items: Item[] = [];
	for (const page of pages) {
		const envs = (page as { environments?: Array<{ name?: string }> })?.environments;
		if (!Array.isArray(envs)) {
			console.warn("[gh] environments page missing .environments array");
			return { items, complete: false };
		}
		for (const env of envs) {
			const name = env.name?.trim();
			if (!name || !PREVIEW_ENV_RE.test(name)) {
				continue;
			}
			const pr = prFromGithubEnvName(name);
			if (pr === undefined) {
				continue;
			}
			items.push({ kind: "gh-environment", id: name, label: name, pr });
		}
	}
	return { items, complete: true };
}

function listOpenPullRequestNumbers(): {
	ok: boolean;
	numbers: Set<number>;
	maybeTruncated: boolean;
} {
	const numbers = new Set<number>();
	let page = 1;
	for (; page <= 50; page++) {
		const result = spawnSync(
			"gh",
			["api", `repos/{owner}/{repo}/pulls?state=open&per_page=${OPEN_PR_PAGE_SIZE}&page=${page}`],
			{ encoding: "utf8", env: process.env, maxBuffer: 8 * 1024 * 1024 },
		);
		if (result.status !== 0) {
			console.warn("[gh] list open PRs failed:", result.stderr?.trim() || `exit ${result.status}`);
			return { ok: false, numbers, maybeTruncated: false };
		}
		let batch: Array<{ number?: number }> = [];
		try {
			batch = JSON.parse(result.stdout ?? "[]") as Array<{ number?: number }>;
		} catch {
			console.warn("[gh] list open PRs: invalid JSON");
			return { ok: false, numbers, maybeTruncated: false };
		}
		if (!Array.isArray(batch)) {
			console.warn("[gh] list open PRs: expected array");
			return { ok: false, numbers, maybeTruncated: false };
		}
		for (const row of batch) {
			const n = row.number;
			if (typeof n === "number" && Number.isInteger(n) && n > 0) {
				numbers.add(n);
			}
		}
		if (batch.length < OPEN_PR_PAGE_SIZE) {
			return { ok: true, numbers, maybeTruncated: false };
		}
	}
	console.warn(
		`[gh] list open PRs: hit page cap (${page - 1}×${OPEN_PR_PAGE_SIZE}); treat as incomplete`,
	);
	return { ok: false, numbers, maybeTruncated: true };
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
			// Prefer after worker delete (caller order). Raw DELETE may still fail on newer accounts
			// that only retire namespaces via Worker export tombstones — treat as hard failure.
			const r = await cfApi(
				"DELETE",
				`/workers/durable_objects/namespaces/${encodeURIComponent(item.id)}`,
				accountId,
				cfToken,
			);
			if (!r.ok && r.status !== 404) {
				console.warn(
					`\n    cf delete DO namespace errors (worker must be gone first; tombstones may be required): ${JSON.stringify(r.errors)}`,
				);
			}
			return r.ok || r.status === 404;
		}
		case "gh-environment": {
			const list = spawnSync(
				"gh",
				[
					"api",
					"--paginate",
					`repos/{owner}/{repo}/deployments?environment=${encodeURIComponent(item.id)}&per_page=100`,
				],
				{ encoding: "utf8", env: process.env, maxBuffer: 8 * 1024 * 1024 },
			);
			if (list.status !== 0) {
				console.warn(
					`\n    gh list deployments for ${item.id} failed:`,
					list.stderr?.trim() || `exit ${list.status}`,
				);
				return false;
			}
			const pages = parseGhPaginatedJson(list.stdout ?? "");
			const deploymentIds: string[] = [];
			for (const page of pages) {
				const rows = Array.isArray(page) ? page : [];
				for (const row of rows as Array<{ id?: number | string }>) {
					if (row?.id != null) {
						deploymentIds.push(String(row.id));
					}
				}
			}
			let statusErrors = 0;
			for (const id of deploymentIds) {
				const st = spawnSync(
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
				if (st.status !== 0) {
					statusErrors += 1;
					console.warn(
						`\n    gh inactive status failed for deployment ${id}:`,
						st.stderr?.trim() || `exit ${st.status}`,
					);
				}
			}
			const del = spawnSync(
				"gh",
				["api", "-X", "DELETE", `repos/{owner}/{repo}/environments/${encodeURIComponent(item.id)}`],
				{ encoding: "utf8", env: process.env },
			);
			const delOk = del.status === 0 || (del.stderr ?? "").toLowerCase().includes("404");
			if (!delOk) {
				console.warn(
					`\n    gh delete environment ${item.id} failed:`,
					del.stderr?.trim() || `exit ${del.status}`,
				);
			}
			return delOk && statusErrors === 0;
		}
		default:
			console.warn(`Unknown kind ${item.kind}`);
			return false;
	}
}

function itemKey(item: Item): string {
	return `${item.kind}:${item.id}`;
}

async function attemptDeletes(
	items: Item[],
	accountId: string | undefined,
	cfToken: string | undefined,
	succeeded: Set<string>,
	failed: Set<string>,
): Promise<void> {
	for (const item of items) {
		const key = itemKey(item);
		if (succeeded.has(key)) {
			continue;
		}
		process.stdout.write(`  deleting [${item.kind}] ${item.label} … `);
		try {
			const ok = await deleteItem(item, accountId, cfToken);
			if (ok) {
				succeeded.add(key);
				failed.delete(key);
				console.log("ok");
			} else {
				failed.add(key);
				console.log("FAILED");
			}
		} catch (error) {
			failed.add(key);
			console.log(`FAILED (${String(error)})`);
		}
	}
}

async function main(): Promise<void> {
	const { exclude: manualExclude, apply, includeOpen } = parseArgs(process.argv.slice(2));
	findRepoRoot(); // validate cwd / workspace

	const openListed = listOpenPullRequestNumbers();
	if (apply && !includeOpen && !openListed.ok) {
		console.error(
			"[preview-cleanup-orphans] --apply aborted: could not fully list open PRs (pass --include-open only if intentional)",
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
	let scansComplete = true;

	if (accountId && cfToken) {
		const lists = await Promise.all([
			listCfWorkers(accountId, cfToken),
			listCfD1(accountId, cfToken),
			listCfR2(accountId, cfToken),
			listCfKv(accountId, cfToken),
			listCfDoNamespaces(accountId, cfToken),
		]);
		for (const list of lists) {
			discovered.push(...list.items);
			if (!list.complete) {
				scansComplete = false;
			}
		}
	} else {
		console.warn(
			"[cf] CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN unset — skipping Cloudflare scan",
		);
	}

	const ghEnvs = listGithubPreviewEnvs();
	discovered.push(...ghEnvs.items);
	if (!ghEnvs.complete) {
		scansComplete = false;
	}

	if (!scansComplete) {
		console.warn(
			"[preview-cleanup-orphans] one or more inventory scans were incomplete — results may under-report",
		);
		if (apply) {
			console.error(
				"[preview-cleanup-orphans] --apply aborted: refusing to delete from an incomplete inventory",
			);
			process.exit(1);
		}
	}

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

	const workers = filtered.filter((i) => i.kind === "worker");
	const doNamespaces = filtered.filter((i) => i.kind === "do-namespace");
	const other = filtered.filter((i) => i.kind !== "worker" && i.kind !== "do-namespace");

	// 1) Strip bindings so circular service refs / DO classes do not block DELETE.
	if (accountId && cfToken && workers.length > 0) {
		console.log(`[preview-cleanup-orphans] stripping bindings on ${workers.length} worker(s)…`);
		for (const w of workers) {
			const ok = await stripWorkerBindings(accountId, cfToken, w.id);
			console.log(`  strip ${w.label}: ${ok ? "ok" : "FAILED"}`);
		}
	}

	// 2) Workers first, then DO namespaces (class must be gone), then everything else.
	console.log("[preview-cleanup-orphans] deleting workers…");
	await attemptDeletes(workers, accountId, cfToken, succeeded, failed);
	console.log("[preview-cleanup-orphans] deleting DO namespaces…");
	await attemptDeletes(doNamespaces, accountId, cfToken, succeeded, failed);
	console.log("[preview-cleanup-orphans] deleting remaining resources…");
	await attemptDeletes(other, accountId, cfToken, succeeded, failed);

	// 3) Retry anything still failed (peer deletes / binding races).
	const retryItems = filtered.filter((i) => failed.has(itemKey(i)));
	if (retryItems.length > 0) {
		console.log(`[preview-cleanup-orphans] retrying ${retryItems.length} failed delete(s)…`);
		await attemptDeletes(retryItems, accountId, cfToken, succeeded, failed);
	}

	const okCount = succeeded.size;
	const failCount = failed.size;
	console.log(`[preview-cleanup-orphans] done — deleted=${okCount} failed=${failCount}`);
	if (failCount > 0) {
		process.exit(1);
	}
}

await main();
