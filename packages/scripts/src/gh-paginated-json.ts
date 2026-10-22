/**
 * Parse `gh api --paginate` / `--paginate --slurp` stdout into page payloads.
 * Prefer `--slurp` so multi-page object endpoints are a JSON array of pages.
 * Callers iterate pages; a non-slurped array endpoint yields one page that is the array.
 */
export function parseGhPaginatedJson(stdout: string): unknown[] {
	const raw = stdout.trim();
	if (!raw) {
		return [];
	}
	try {
		const once = JSON.parse(raw) as unknown;
		if (Array.isArray(once)) {
			if (once.length === 0) {
				// Empty deployments list (non-slurp) or empty slurp — one empty page.
				return [once];
			}
			const first = once[0];
			// `--slurp`: each element is a page (array page or environments object page).
			if (
				Array.isArray(first) ||
				(first != null && typeof first === "object" && "environments" in first)
			) {
				return once;
			}
			// Non-slurp concatenated array endpoint (e.g. deployments) → one page.
			return [once];
		}
		return [once];
	} catch {
		// NDJSON, or `}{` / `][` concatenated docs without a top-level parse.
	}
	return splitConcatenatedJsonDocuments(raw);
}

/** Split top-level JSON values concatenated as NDJSON or `}{` / `][`. */
function splitConcatenatedJsonDocuments(raw: string): unknown[] {
	const pages: unknown[] = [];
	let depth = 0;
	let inString = false;
	let escaped = false;
	let start = -1;
	for (let i = 0; i < raw.length; i++) {
		const c = raw.charAt(i);
		if (inString) {
			if (escaped) {
				escaped = false;
			} else if (c === "\\") {
				escaped = true;
			} else if (c === '"') {
				inString = false;
			}
			continue;
		}
		if (c === '"') {
			inString = true;
			continue;
		}
		if (c === "{" || c === "[") {
			if (depth === 0) {
				start = i;
			}
			depth++;
			continue;
		}
		if (c === "}" || c === "]") {
			if (depth === 0) {
				return [];
			}
			depth--;
			if (depth === 0 && start >= 0) {
				try {
					pages.push(JSON.parse(raw.slice(start, i + 1)) as unknown);
				} catch {
					return [];
				}
				start = -1;
			}
		}
	}
	if (depth !== 0) {
		return [];
	}
	return pages;
}

/** Flatten paginated deployment list pages into deployment ids. */
export function deploymentIdsFromGhPages(pages: unknown[]): string[] {
	const deploymentIds: string[] = [];
	for (const page of pages) {
		const rows = Array.isArray(page) ? page : [];
		for (const row of rows as Array<{ id?: number | string }>) {
			if (row?.id != null) {
				deploymentIds.push(String(row.id));
			}
		}
	}
	return deploymentIds;
}

/** Collect environment names from paginated Environments API pages. */
export function environmentNamesFromGhPages(pages: unknown[]): {
	names: string[];
	complete: boolean;
} {
	const names: string[] = [];
	for (const page of pages) {
		const envs = (page as { environments?: Array<{ name?: string }> })?.environments;
		if (!Array.isArray(envs)) {
			return { names, complete: false };
		}
		for (const env of envs) {
			const name = env.name?.trim();
			if (name) {
				names.push(name);
			}
		}
	}
	return { names, complete: true };
}
