import { spawnSync } from "node:child_process";

/** GitHub Actions tab URL for the current repo, or null if `gh` cannot resolve. */
export function githubActionsUrl(repoRoot: string): string | null {
	const r = spawnSync("gh", ["repo", "view", "--json", "url", "-q", ".url"], {
		cwd: repoRoot,
		encoding: "utf8",
	});
	if (r.status !== 0) {
		return null;
	}
	const base = r.stdout?.trim();
	if (!base) {
		return null;
	}
	return `${base.replace(/\/$/, "")}/actions`;
}
