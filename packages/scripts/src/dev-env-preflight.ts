import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { styleText } from "node:util";
import { mergeCloudflareAlchemyAccountEnvInto } from "alchemy-utils/cloudflare-account-env";
import { isLocalGoogleOAuthPortlessConflict } from "alchemy-utils/local-google-oauth-dev";
import { parse as parseDotenv } from "dotenv";
import {
	missingLocalDevConfigurationKeys,
	setupCommandLabelForDotfileRel,
} from "./github-environment-secrets";

const LOCAL_DOTFILE = ".env.local";

export function loadLocalDevEnv(repoRoot: string): Record<string, string | undefined> {
	const out = { ...process.env } as Record<string, string | undefined>;
	const full = resolve(repoRoot, LOCAL_DOTFILE);
	if (existsSync(full)) {
		const parsed = parseDotenv(readFileSync(full, "utf8"));
		for (const [k, v] of Object.entries(parsed)) {
			if (v !== undefined) {
				out[k] = v;
			}
		}
	}
	return mergeCloudflareAlchemyAccountEnvInto(out);
}

export function runLocalDevEnvPreflight(repoRoot: string): void {
	const env = loadLocalDevEnv(repoRoot);
	const missing = missingLocalDevConfigurationKeys(env);
	if (isLocalGoogleOAuthPortlessConflict(env, "local")) {
		console.warn("");
		console.warn(
			styleText(
				"red",
				"[dev:preflight] Google OAuth + Portless: loopback OAuth proxy is not active — Google sign-in may fail.",
			),
		);
		console.warn("  See docs/oauth-setup.md (Portless + Google).");
		console.warn("");
	}
	if (!env["AUTH_BOOTSTRAP_ADMIN_EMAILS"]?.trim()) {
		console.warn("");
		console.warn(
			"[dev:preflight] AUTH_BOOTSTRAP_ADMIN_EMAILS is unset — no bootstrap admin. Add your email to .env.local, restart dev, then `bun run auth:sync-bootstrap-admins`.",
		);
		console.warn("");
	}
	if (missing.length === 0) {
		return;
	}
	const setup = setupCommandLabelForDotfileRel(LOCAL_DOTFILE);
	console.error("");
	console.error(
		`[dev:preflight] Missing required values in ${LOCAL_DOTFILE} (or the environment): ${missing.join(", ")}`,
	);
	console.error("");
	console.error(
		`  Fix: ${setup}   (fills missing regeneratable secrets; does not rotate existing values)`,
	);
	console.error("  Or add the keys manually — see .env.example");
	console.error("");
	throw new Error(`dev:preflight: incomplete local configuration (${missing.length} missing)`);
}
