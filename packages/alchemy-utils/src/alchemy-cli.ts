#!/usr/bin/env bun
import { spawn } from "node:child_process";
/**
 * Workspace Alchemy wrapper: loads stage dotfiles + machine **account.env**, then runs
 * `bun alchemy <verb> [--entry.ts] --app <id>`.
 *
 * Per-package defaults live in **`package.json` → `alchemy.app`** (optional **`alchemy.entry`**).
 *
 * @example From `apps/web`
 *   alchemy-cli --stage prod deploy
 * @example Admin stack from repo root
 *   alchemy-cli --stage prod --app admin --entry stacks/admin.ts deploy
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { parse as parseDotenv } from "dotenv";

import {
	isCloudflareAlchemyAccountEnvKey,
	mergeCloudflareAlchemyAccountEnvInto,
} from "./cloudflare-account-env";
import { isPrStage } from "./deployment-stage";
import { ALCHEMY_APP_IDS, PRODUCT_PREFIX } from "./worker-peer-scripts";

type AppKey = keyof typeof ALCHEMY_APP_IDS;

type StageFlag = "prod" | "staging" | "local" | "preview";

type AlchemyPackageJson = {
	readonly name?: string;
	readonly alchemy?: {
		readonly app?: string;
		readonly entry?: string;
	};
};

const verbs = ["deploy", "destroy", "dev"] as const;
type Verb = (typeof verbs)[number];

function isVerb(v: string | undefined): v is Verb {
	return v !== undefined && (verbs as readonly string[]).includes(v);
}

function resolveAppId(segment: string): string {
	if (segment in ALCHEMY_APP_IDS) {
		return ALCHEMY_APP_IDS[segment as AppKey];
	}
	return `${PRODUCT_PREFIX}-${segment}`;
}

/**
 * Repo root for env files (`/.env.local`, …) is the npm/bun workspace root (**`package.json` → `"workspaces"`**),
 * not the nearest **`turbo.json`** (nested packages extend the root **`turbo.json`** and also have **`turbo.json`**).
 */
function findRepoRoot(startDir: string): string {
	let dir = path.resolve(startDir);
	while (true) {
		const pkgPath = path.join(dir, "package.json");
		if (existsSync(pkgPath)) {
			try {
				const raw = readFileSync(pkgPath, "utf8");
				const j = JSON.parse(raw) as { workspaces?: unknown };
				if (j.workspaces != null) {
					return dir;
				}
			} catch {
				// continue searching
			}
		}
		const parent = path.dirname(dir);
		if (parent === dir) {
			throw new Error(
				`alchemy-cli: could not find workspace root (package.json with "workspaces") above ${path.resolve(startDir)}`,
			);
		}
		dir = parent;
	}
}

function readPackageJson(dir: string): AlchemyPackageJson | null {
	const p = path.join(dir, "package.json");
	if (!existsSync(p)) {
		return null;
	}
	try {
		return JSON.parse(readFileSync(p, "utf8")) as AlchemyPackageJson;
	} catch {
		return null;
	}
}

function applyDotfileToEnv(
	repoRoot: string,
	dotfileName: string,
	options: { skipStageKey: boolean },
): void {
	const full = path.join(repoRoot, dotfileName);
	let bag = { ...process.env } as Record<string, string | undefined>;
	if (existsSync(full)) {
		const parsed = parseDotenv(readFileSync(full, "utf8"));
		for (const [k, v] of Object.entries(parsed)) {
			if (v === undefined) {
				continue;
			}
			if (options.skipStageKey && k === "STAGE") {
				continue;
			}
			if (isCloudflareAlchemyAccountEnvKey(k)) {
				continue;
			}
			bag[k] = v;
		}
	}
	bag = mergeCloudflareAlchemyAccountEnvInto(bag);
	for (const [k, v] of Object.entries(bag)) {
		if (v !== undefined) {
			process.env[k] = v;
		}
	}
}

/** Optional per-package **`.env.local`** (skill: cf-workers-env-local); never overrides **`STAGE`** from root. */
function mergeOptionalPackageLocalDotenv(repoRoot: string, pkgDir: string): void {
	if (path.resolve(pkgDir) === path.resolve(repoRoot)) {
		return;
	}
	const full = path.join(pkgDir, ".env.local");
	if (!existsSync(full)) {
		return;
	}
	const parsed = parseDotenv(readFileSync(full, "utf8"));
	let bag = { ...process.env } as Record<string, string | undefined>;
	for (const [k, v] of Object.entries(parsed)) {
		if (v === undefined) {
			continue;
		}
		if (k === "STAGE") {
			continue;
		}
		if (isCloudflareAlchemyAccountEnvKey(k)) {
			continue;
		}
		bag[k] = v;
	}
	bag = mergeCloudflareAlchemyAccountEnvInto(bag);
	for (const [k, v] of Object.entries(bag)) {
		if (v !== undefined) {
			process.env[k] = v;
		}
	}
}

function applyStageMode(repoRoot: string, pkgDir: string, stage: StageFlag): void {
	if (stage === "prod") {
		process.env["STAGE"] = "prod";
		applyDotfileToEnv(repoRoot, ".env.production", { skipStageKey: false });
		return;
	}
	if (stage === "staging") {
		process.env["STAGE"] = "staging";
		applyDotfileToEnv(repoRoot, ".env.staging", { skipStageKey: false });
		return;
	}
	if (stage === "local") {
		process.env["STAGE"] = "local";
		applyDotfileToEnv(repoRoot, ".env.local", { skipStageKey: false });
		mergeOptionalPackageLocalDotenv(repoRoot, pkgDir);
		return;
	}
	// preview: merge staging dotfile but do not override STAGE from file; CI sets STAGE=pr-<n>
	applyDotfileToEnv(repoRoot, ".env.staging", { skipStageKey: true });
	const st = process.env["STAGE"]?.trim() ?? "";
	if (!isPrStage(st)) {
		console.error(
			[
				"alchemy-cli: --stage preview requires STAGE=pr-<number> in the environment (CI sets this).",
				"Example: STAGE=pr-42 alchemy-cli --stage preview deploy",
				"(staging secrets still load from .env.staging; STAGE is not taken from that file in preview mode.)",
			].join("\n"),
		);
		process.exit(2);
	}
}

function printUsage(stream: "stdout" | "stderr" = "stderr"): void {
	const text = [
		`Usage: alchemy-cli --stage <prod|staging|local|preview> [options] <${verbs.join("|")}> [package-dir]`,
		"",
		"Options:",
		"  -h, --help         Show this message",
		"  --app <key|id>     Alchemy app key (ALCHEMY_APP_IDS) or full id / suffix (default: package.json → alchemy.app)",
		"  --entry <path>     Path to alchemy.run.ts stack, relative to repo root (default: package alchemy.entry or alchemy.run.ts)",
		"",
		"Examples:",
		"  alchemy-cli --stage prod deploy",
		"  alchemy-cli --stage local dev",
		`  alchemy-cli --stage prod --app admin --entry stacks/admin.ts deploy`,
		"",
		`app keys: ${Object.keys(ALCHEMY_APP_IDS).sort().join(", ")}`,
		`other segments resolve to --app \`${PRODUCT_PREFIX}-<suffix>\``,
	].join("\n");
	if (stream === "stdout") {
		console.log(text);
	} else {
		console.error(text);
	}
}

/** Args before `--` only; forwarded args after `--` are not scanned. */
function argvHasHelpFlag(argv: string[]): boolean {
	const dd = argv.indexOf("--");
	const head = dd === -1 ? argv : argv.slice(0, dd);
	return head.includes("--help") || head.includes("-h");
}

function parseArgs(argv: string[]): {
	stage: StageFlag;
	appOverride: string | undefined;
	entryOverride: string | undefined;
	verb: Verb;
	packagePath: string;
	forwarded: string[];
} {
	let stage: StageFlag | undefined;
	let appOverride: string | undefined;
	let entryOverride: string | undefined;
	const positional: string[] = [];
	const forwarded: string[] = [];

	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--") {
			forwarded.push(...argv.slice(i + 1));
			break;
		}
		if (a === "--stage") {
			const v = argv[++i]?.trim();
			if (v === "prod" || v === "staging" || v === "local" || v === "preview") {
				stage = v;
			} else {
				console.error(
					`alchemy-cli: --stage must be prod|staging|local|preview (got ${JSON.stringify(v)})`,
				);
				process.exit(2);
			}
			continue;
		}
		if (a === "--app") {
			appOverride = argv[++i]?.trim();
			if (!appOverride) {
				console.error("alchemy-cli: --app requires a value");
				process.exit(2);
			}
			continue;
		}
		if (a === "--entry") {
			entryOverride = argv[++i]?.trim();
			if (!entryOverride) {
				console.error("alchemy-cli: --entry requires a value");
				process.exit(2);
			}
			continue;
		}
		if (a.startsWith("--")) {
			console.error(`alchemy-cli: unknown flag ${a}`);
			printUsage();
			process.exit(2);
		}
		positional.push(a);
	}

	if (!stage) {
		console.error("alchemy-cli: --stage is required");
		printUsage();
		process.exit(2);
	}

	const verb = positional[0];
	if (!isVerb(verb)) {
		console.error(`alchemy-cli: expected verb ${verbs.join("|")}`);
		printUsage();
		process.exit(2);
	}

	const packagePath = positional[1] ?? ".";
	return { stage, appOverride, entryOverride, verb, packagePath, forwarded };
}

function resolveSpawnTarget(
	repoRoot: string,
	pkgDir: string,
	entryOverride: string | undefined,
	pkgJson: AlchemyPackageJson | null,
): { spawnCwd: string; scriptArg: string | undefined } {
	const defaultEntryName = pkgJson?.alchemy?.entry ?? "alchemy.run.ts";
	const resolvedEntry = entryOverride
		? path.resolve(repoRoot, entryOverride)
		: path.resolve(pkgDir, defaultEntryName);

	const defaultAlchemyRun = path.join(pkgDir, "alchemy.run.ts");
	if (resolvedEntry === defaultAlchemyRun) {
		return { spawnCwd: pkgDir, scriptArg: undefined };
	}
	const relFromRoot = path.relative(repoRoot, resolvedEntry).replace(/\\/g, "/");
	if (relFromRoot.startsWith("..") || path.isAbsolute(relFromRoot)) {
		throw new Error(`alchemy-cli: entry must be under repo root (${resolvedEntry})`);
	}
	return { spawnCwd: repoRoot, scriptArg: relFromRoot };
}

function main(): void {
	const argv = process.argv.slice(2);
	if (argvHasHelpFlag(argv)) {
		printUsage("stdout");
		process.exit(0);
	}

	const parsed = parseArgs(argv);

	const pkgDir = path.resolve(process.cwd(), parsed.packagePath);
	const repoRoot = findRepoRoot(pkgDir);

	const pkgJson = readPackageJson(pkgDir);
	const appSegment = parsed.appOverride ?? pkgJson?.alchemy?.app?.trim();
	if (!appSegment) {
		console.error(
			[
				"alchemy-cli: missing app id — pass --app <key> or add to package.json:",
				'  "alchemy": { "app": "frontend" }',
			].join("\n"),
		);
		process.exit(2);
	}

	applyStageMode(repoRoot, pkgDir, parsed.stage);

	const appId = resolveAppId(appSegment);
	const { spawnCwd, scriptArg } = resolveSpawnTarget(
		repoRoot,
		pkgDir,
		parsed.entryOverride,
		pkgJson,
	);

	const alchemyParts = ["alchemy", parsed.verb];
	if (scriptArg) {
		alchemyParts.push(scriptArg);
	}
	alchemyParts.push("--app", appId);

	const child = spawn("bun", [...alchemyParts, ...parsed.forwarded], {
		stdio: "inherit",
		env: process.env,
		shell: false,
		cwd: spawnCwd,
	});

	child.on("error", (err) => {
		console.error(err);
		process.exit(1);
	});

	child.on("close", (code, signal) => {
		process.exit(signal ? 1 : (code ?? 1));
	});
}

main();
