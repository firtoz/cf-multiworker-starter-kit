#!/usr/bin/env bun
/**
 * Runs `alchemy <verb> [--app]` with an id from {@link ALCHEMY_APP_IDS} or `${PRODUCT_PREFIX}-<suffix>`
 * when the segment is not a known key — forks only edit **`PRODUCT_PREFIX`** / **`ALCHEMY_APP_IDS`** in **`worker-peer-scripts.ts`**.
 *
 * @example Deploy D1 package (cwd = package root)
 *   bun ../alchemy-utils/src/alchemy-cli.ts deploy database
 * @example Admin stack from repo root
 *   bun packages/alchemy-utils/src/alchemy-cli.ts deploy admin stacks/admin.ts
 * @example Generated durable object with kebab slug `widgets`
 *   bun ../../packages/alchemy-utils/src/alchemy-cli.ts deploy widgets
 */
import { spawn } from "node:child_process";
import process from "node:process";

import { loadCloudflareAlchemyAccountEnvIntoProcess } from "./cloudflare-account-env";
import { ALCHEMY_APP_IDS, PRODUCT_PREFIX } from "./worker-peer-scripts";

type AppKey = keyof typeof ALCHEMY_APP_IDS;

function resolveAppId(segment: string): string {
	if (segment in ALCHEMY_APP_IDS) {
		return ALCHEMY_APP_IDS[segment as AppKey];
	}
	return `${PRODUCT_PREFIX}-${segment}`;
}

const verbs = ["deploy", "destroy", "dev"] as const;
type Verb = (typeof verbs)[number];

function isVerb(v: string | undefined): v is Verb {
	return v !== undefined && (verbs as readonly string[]).includes(v);
}

function main(): void {
	loadCloudflareAlchemyAccountEnvIntoProcess();

	const argv = process.argv.slice(2);
	const verb = argv[0];

	if (!isVerb(verb)) {
		console.error(
			[
				`Usage: bun alchemy-cli.ts <${verbs.join("|")}> <appKey|suffix> [alchemy-entry.ts] [extra-args...]`,
				"",
				`appKey ∈ ${Object.keys(ALCHEMY_APP_IDS).sort().join(", ")}`,
				"",
				`Any other <suffix> resolves to --app \`${PRODUCT_PREFIX}-<suffix>\` (generator / one-off scripts).`,
				"",
				"With a local stack file:",
				"  bun alchemy-cli.ts deploy admin stacks/admin.ts",
			].join("\n"),
		);
		process.exit(1);
	}

	let appSegment: string;
	let alchemyScript: string | undefined;
	let forwarded: string[];

	if (argv[2]?.endsWith(".ts")) {
		appSegment = argv[1];
		alchemyScript = argv[2];
		forwarded = argv.slice(3);
	} else {
		appSegment = argv[1];
		forwarded = argv.slice(2);
	}

	if (!appSegment) {
		console.error(alchemyCliUsage());
		process.exit(1);
	}

	const appId = resolveAppId(appSegment);

	const alchemyParts = ["alchemy", verb];
	if (alchemyScript) {
		alchemyParts.push(alchemyScript);
	}
	alchemyParts.push("--app", appId);
	const child = spawn("bun", [...alchemyParts, ...forwarded], {
		stdio: "inherit",
		env: process.env,
		shell: false,
	});

	child.on("error", (err) => {
		console.error(err);
		process.exit(1);
	});

	child.on("close", (code, signal) => {
		process.exit(signal ? 1 : (code ?? 1));
	});
}

function alchemyCliUsage(): string {
	return `alchemy-cli.ts: pass an ALCHEMY_APP_IDS key (${Object.keys(ALCHEMY_APP_IDS).sort().join(", ")}) or a PRODUCT_PREFIX suffix.`;
}

main();
