/**
 * Deploy gate for GitHub Actions and local runs.
 *
 * - **CI + not yet enabled:** `DEPLOY_ENABLED` is not `true` → print a notice on stdout, write `deploy_enabled=false` to `GITHUB_OUTPUT`, exit 0.
 * - **CI + enabled:** missing required secrets → exit 1 (stderr ok).
 * - **Local:** ignores the enablement flag; checks required variables using `process.env` merged with the stage dotenv file when it exists.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isPrStage, resolveStageFromEnv } from "alchemy-utils/deployment-stage";
import { parse as parseDotenv } from "dotenv";
import { DEPLOY_ENABLED_VAR, missingDeployConfigurationKeys } from "./github-environment-secrets";

const MODES = ["prod", "staging", "preview"] as const;
type PreflightMode = (typeof MODES)[number];

const ENABLE_VAR = DEPLOY_ENABLED_VAR;

function usage(): never {
	console.log(`Usage: bun ./deploy-preflight.ts <${MODES.join("|")}>`);
	process.exit(2);
}

function parseMode(argv: string[]): PreflightMode {
	const raw = argv[2]?.trim();
	if (raw === "prod" || raw === "staging" || raw === "preview") {
		return raw;
	}
	usage();
}

function githubActionsOutput(name: string, value: string) {
	const path = process.env["GITHUB_OUTPUT"];
	if (path) {
		appendFileSync(path, `${name}=${value}\n`, "utf8");
	}
}

function isTruthyEnabled(v: string | undefined): boolean {
	return v?.trim().toLowerCase() === "true";
}

function validateStageForMode(mode: PreflightMode, stage: string): void {
	if (mode === "prod" && stage !== "prod") {
		throw new Error(
			`deploy-preflight: mode prod requires STAGE=prod (got ${JSON.stringify(stage)})`,
		);
	}
	if (mode === "staging" && stage !== "staging") {
		throw new Error(
			`deploy-preflight: mode staging requires STAGE=staging (got ${JSON.stringify(stage)})`,
		);
	}
	if (mode === "preview" && !isPrStage(stage)) {
		throw new Error(
			`deploy-preflight: mode preview requires STAGE=pr-<number> (got ${JSON.stringify(stage)})`,
		);
	}
}

function dotenvRelForMode(mode: PreflightMode): string {
	if (mode === "prod") {
		return ".env.production";
	}
	return ".env.staging";
}

function loadMergeEnv(mode: PreflightMode): Record<string, string | undefined> {
	const root = resolve(import.meta.dir, "../../..");
	const rel = dotenvRelForMode(mode);
	const full = resolve(root, rel);
	const out = { ...process.env } as Record<string, string | undefined>;
	if (existsSync(full)) {
		const parsed = parseDotenv(readFileSync(full, "utf8"));
		for (const [k, v] of Object.entries(parsed)) {
			if (v !== undefined) {
				out[k] = v;
			}
		}
	}
	return out;
}

function printEnablementNotice(_mode: PreflightMode) {
	const lines = [
		"",
		"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
		"  Deploy is not enabled for this repository in GitHub Actions yet.",
		`  (${ENABLE_VAR} is not set to true on the target GitHub Environment.)`,
		"",
		"  This is expected for a fresh fork. Quality CI still runs; deploy was skipped.",
		"",
		"  When you are ready to ship from CI, run from the repo root:",
		"    • bun run onboard:staging   — staging/PR preview secrets + sync (needs gh + .env.staging Cloudflare keys)",
		"    • bun run onboard:prod      — production secrets + sync + optional main→production PR automation gate",
		"    • bun run github:setup      — guided overview of setup + sync commands",
		"",
		"  Lower-level (same outcome when you already know the flow):",
		"    • bun run setup:staging && bun run github:sync:staging",
		"    • bun run setup:prod && bun run github:sync:prod",
		"    • bun run github:sync            — both stage dotfiles, staging then production",
		"    • bun run github:env             — deployment protection only (no secrets/variables pushed)",
		"",
		`  The github:sync / github:sync:* commands set ${ENABLE_VAR}=true on the target GitHub Environment.`,
		"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
		"",
	];
	for (const line of lines) {
		console.log(line);
	}
}

const mode = parseMode(process.argv);
const isCi = process.env["CI"] === "true";

if (isCi && !isTruthyEnabled(process.env[ENABLE_VAR])) {
	printEnablementNotice(mode);
	githubActionsOutput("deploy_enabled", "false");
	process.exit(0);
}

let stage: string;
try {
	stage = resolveStageFromEnv();
} catch (e) {
	console.error(e instanceof Error ? e.message : e);
	process.exit(1);
}

try {
	validateStageForMode(mode, stage);
} catch (e) {
	console.error(e instanceof Error ? e.message : e);
	process.exit(1);
}

const envBag = isCi
	? ({ ...process.env } as Record<string, string | undefined>)
	: loadMergeEnv(mode);
const missing = missingDeployConfigurationKeys(envBag, { requiresAlchemyStateToken: isCi });
if (missing.length > 0) {
	console.error("");
	console.error(
		isCi
			? `deploy-preflight: GitHub Environment is marked enabled but required secrets/vars are missing: ${missing.join(", ")}`
			: `deploy-preflight: missing required values (set in ${dotenvRelForMode(mode)} or the environment): ${missing.join(", ")}`,
	);
	console.error("");
	if (mode === "prod") {
		console.error(
			"  Fix: bun run onboard:prod   (or bun run setup:prod && bun run github:sync:prod)",
		);
	} else {
		console.error(
			"  Fix: bun run onboard:staging   (or bun run setup:staging && bun run github:sync:staging)",
		);
	}
	console.error("");
	process.exit(1);
}

if (isCi) {
	githubActionsOutput("deploy_enabled", "true");
}

console.log("deploy-preflight: required deploy configuration is present.");
process.exit(0);
