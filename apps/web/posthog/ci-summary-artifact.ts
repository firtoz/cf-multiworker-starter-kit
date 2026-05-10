/**
 * Optional Markdown snippet for GitHub Actions **Job summary** (same pattern as **`CI_WEB_DEPLOY_URL_RELPATH`**).
 * Only written when **`GITHUB_WORKSPACE`** is set. Never contains secrets.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CI_POSTHOG_SOURCEMAPS_SUMMARY_RELPATH } from "alchemy-utils/ci-deploy-web-url";

function ciSummaryAbsolutePath(): string | null {
	const root = process.env["GITHUB_WORKSPACE"]?.trim();
	if (!root) {
		return null;
	}
	return path.join(root, CI_POSTHOG_SOURCEMAPS_SUMMARY_RELPATH);
}

/** Replace the whole file (call from **`log-sourcemaps-plan`** during **`alchemy.run.ts`**). */
export function writePosthogSourcemapsCiSummary(markdown: string): void {
	const p = ciSummaryAbsolutePath();
	if (!p) {
		return;
	}
	mkdirSync(path.dirname(p), { recursive: true });
	writeFileSync(p, `${markdown.trim()}\n`, "utf8");
}

/** Append a section (call from **`upload-sourcemaps.ts`**). */
export function appendPosthogSourcemapsCiSummary(markdown: string): void {
	const p = ciSummaryAbsolutePath();
	if (!p) {
		return;
	}
	mkdirSync(path.dirname(p), { recursive: true });
	const prev = existsSync(p) ? readFileSync(p, "utf8").trimEnd() : "";
	const sep = prev.length > 0 ? "\n\n" : "";
	appendFileSync(p, `${sep}${markdown.trim()}\n`, "utf8");
}
