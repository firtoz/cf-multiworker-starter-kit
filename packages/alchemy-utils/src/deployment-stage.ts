/**
 * Single source of truth for Alchemy physical stage in `alchemy.run.ts` files:
 * **`process.env.STAGE`** only (no `--stage` argv fallback — scripts/CI must set `STAGE`).
 *
 * @see https://alchemy.run/concepts/apps-and-stages/
 */

const PR_STAGE_RE = /^pr-(\d+)$/;

export function isPrStage(stage: string): boolean {
	return PR_STAGE_RE.test(stage);
}

export function parsePrNumberFromStage(stage: string): number | undefined {
	const m = PR_STAGE_RE.exec(stage);
	return m ? Number(m[1]) : undefined;
}

/**
 * @throws When **`STAGE`** is missing or empty.
 */
export function resolveStageFromEnv(): string {
	const fromEnv = process.env["STAGE"]?.trim();
	if (fromEnv && fromEnv.length > 0) {
		return fromEnv;
	}
	throw new Error(
		[
			"Missing deploy stage: set STAGE in the environment (e.g. local, staging, prod, pr-123).",
			"Use alchemy-cli --stage <local|staging|prod|preview> (it sets STAGE and loads repo dotfiles) or set STAGE in CI.",
			"Alchemy `alchemy.run.ts` entrypoints do not read `--stage` from argv.",
		].join(" "),
	);
}
