/**
 * Post-deploy: promote users matching AUTH_BOOTSTRAP_ADMIN_EMAILS via the web worker machine-admin route.
 *
 * Requires web + auth workers deployed. CI reads `.alchemy/ci/web-deploy-url.txt` from deploy.
 * Local: web dev origin (Portless or `http://127.0.0.1:<port>`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { machineAdminBootstrapSyncPath } from "@internal/auth-client";
import { adminBootstrapSyncResponseSchema } from "@internal/auth-db/api-schemas";
import { AUTH_ADMIN_SECRET_HEADER } from "@internal/auth-db/constants";
import { bootstrapAdminFingerprint } from "alchemy-utils/bootstrap-admin-emails";
import {
	CI_BOOTSTRAP_ADMIN_FINGERPRINT_RELPATH,
	CI_WEB_DEPLOY_URL_RELPATH,
} from "alchemy-utils/ci-deploy-web-url";
import { mergeCloudflareAlchemyAccountEnvInto } from "alchemy-utils/cloudflare-account-env";
import { resolveStageFromEnv } from "alchemy-utils/deployment-stage";
import { resolveWebBaseUrl } from "alchemy-utils/web-deploy-hostnames";
import { parse as parseDotenv } from "dotenv";

const REPO_ROOT = resolve(import.meta.dir, "../../..");

function loadStageEnv(stage: string): Record<string, string | undefined> {
	const rel =
		stage === "prod" ? ".env.production" : stage === "local" ? ".env.local" : ".env.staging";
	const out = { ...process.env } as Record<string, string | undefined>;
	const full = resolve(REPO_ROOT, rel);
	if (existsSync(full)) {
		for (const [k, v] of Object.entries(parseDotenv(readFileSync(full, "utf8")))) {
			if (v !== undefined) {
				out[k] = v;
			}
		}
	}
	return mergeCloudflareAlchemyAccountEnvInto(out);
}

async function resolveWebAdminBaseUrl(
	env: Record<string, string | undefined>,
	stage: string,
): Promise<string> {
	const workspace = process.env["GITHUB_WORKSPACE"]?.trim();
	const ciUrlFile = resolve(
		workspace && workspace.length > 0 ? workspace : REPO_ROOT,
		CI_WEB_DEPLOY_URL_RELPATH,
	);
	if (existsSync(ciUrlFile)) {
		const url = readFileSync(ciUrlFile, "utf8").trim();
		if (url) {
			return url.replace(/\/$/, "");
		}
	}

	return (await resolveWebBaseUrl({ stage, env })).replace(/\/$/, "");
}

function fingerprintCachePath(): string {
	const workspace = process.env["GITHUB_WORKSPACE"]?.trim();
	const root = workspace && workspace.length > 0 ? workspace : REPO_ROOT;
	return resolve(root, CI_BOOTSTRAP_ADMIN_FINGERPRINT_RELPATH);
}

function shouldSkipForUnchangedFingerprint(raw: string): boolean {
	if (process.env["FORCE_BOOTSTRAP_SYNC"]?.trim().toLowerCase() === "true") {
		return false;
	}
	const fp = bootstrapAdminFingerprint(raw);
	const cache = fingerprintCachePath();
	if (!existsSync(cache)) {
		return false;
	}
	return readFileSync(cache, "utf8").trim() === fp;
}

function writeFingerprintCache(raw: string): void {
	const fp = bootstrapAdminFingerprint(raw);
	const cache = fingerprintCachePath();
	mkdirSync(resolve(cache, ".."), { recursive: true });
	writeFileSync(cache, `${fp}\n`, "utf8");
}

function resolveStage(): string {
	try {
		return resolveStageFromEnv();
	} catch {
		if (process.env["CI"] === "true") {
			throw new Error("Missing STAGE (required in CI)");
		}
		return "local";
	}
}

async function main(): Promise<void> {
	const stage = resolveStage();
	const env = loadStageEnv(stage);
	const secret = env["AUTH_ADMIN_SECRET"]?.trim() ?? process.env["AUTH_ADMIN_SECRET"]?.trim();
	const bootstrapRaw =
		env["AUTH_BOOTSTRAP_ADMIN_EMAILS"]?.trim() ??
		process.env["AUTH_BOOTSTRAP_ADMIN_EMAILS"]?.trim() ??
		"";

	if (!secret) {
		console.error("[bootstrap-sync] Missing AUTH_ADMIN_SECRET");
		process.exit(1);
	}

	if (!bootstrapRaw) {
		console.log("[bootstrap-sync] AUTH_BOOTSTRAP_ADMIN_EMAILS empty — skip");
		return;
	}

	if (shouldSkipForUnchangedFingerprint(bootstrapRaw)) {
		console.log("[bootstrap-sync] Bootstrap list unchanged — skip");
		return;
	}

	const baseUrl = await resolveWebAdminBaseUrl(env, stage);
	const endpoint = `${baseUrl}${machineAdminBootstrapSyncPath}`;
	const res = await fetch(endpoint, {
		method: "POST",
		headers: { [AUTH_ADMIN_SECRET_HEADER]: secret },
	});

	const text = await res.text();
	if (!res.ok) {
		console.error(`[bootstrap-sync] ${res.status} ${text}`);
		process.exit(1);
	}

	let body: unknown;
	try {
		body = JSON.parse(text) as unknown;
	} catch {
		console.error("[bootstrap-sync] Invalid JSON response");
		process.exit(1);
	}

	const parsed = adminBootstrapSyncResponseSchema.safeParse(body);
	if (!parsed.success) {
		console.error("[bootstrap-sync] Unexpected response shape", parsed.error.flatten());
		process.exit(1);
	}

	writeFingerprintCache(bootstrapRaw);
	console.log(`[bootstrap-sync] OK (${parsed.data.promoted} user(s) promoted) — ${endpoint}`);
}

await main();
