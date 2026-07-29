/**
 * Parse `gh api --paginate` stdout into page payloads.
 * Callers iterate pages; array endpoints yield one page that is the array.
 */
export function parseGhPaginatedJson(stdout: string): unknown[] {
	const raw = stdout.trim();
	if (!raw) {
		return [];
	}
	try {
		const once = JSON.parse(raw) as unknown;
		// Always one page payload (object or array) — never expand array elements into "pages".
		return [once];
	} catch {
		// continue to NDJSON / multi-doc parse
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
			return [];
		}
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
