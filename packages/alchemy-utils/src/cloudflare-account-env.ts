/**
 * Shared Cloudflare account credentials + Alchemy state-store bearer for every project using the
 * same `CLOUDFLARE_ACCOUNT_ID` and default **alchemy-state-service**
 * (see [Cloudflare State Store](https://alchemy.run/guides/cloudflare-state-store/)).
 *
 * One file per machine, not per repo: resolve via {@link resolveCloudflareAlchemyAccountEnvPath}.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseDotenv } from "dotenv";

const OVERRIDE_ENV = "CLOUDFLARE_ALCHEMY_ACCOUNT_ENV" as const;

/** Keys owned by the account-level file (omit from per-project `.env.staging` / `.env.production` when shared). */
export const CLOUDFLARE_ALCHEMY_ACCOUNT_ENV_KEYS = [
	"CLOUDFLARE_ACCOUNT_ID",
	"CLOUDFLARE_API_TOKEN",
	"ALCHEMY_STATE_TOKEN",
] as const;

export type CloudflareAlchemyAccountEnvKey = (typeof CLOUDFLARE_ALCHEMY_ACCOUNT_ENV_KEYS)[number];

export function isCloudflareAlchemyAccountEnvKey(
	key: string,
): key is CloudflareAlchemyAccountEnvKey {
	return (CLOUDFLARE_ALCHEMY_ACCOUNT_ENV_KEYS as readonly string[]).includes(key);
}

/**
 * Cross-platform default for `account.env`:
 *
 * - **`CLOUDFLARE_ALCHEMY_ACCOUNT_ENV`** — absolute path override (all OSes)
 * - Linux / other Unix with XDG: `$XDG_CONFIG_HOME/cloudflare-alchemy/account.env` or `~/.config/cloudflare-alchemy/account.env`
 * - macOS: `~/Library/Application Support/cloudflare-alchemy/account.env`
 * - Windows: `%APPDATA%\\cloudflare-alchemy\\account.env`
 */
export function resolveCloudflareAlchemyAccountEnvPath(): string {
	const override = process.env[OVERRIDE_ENV]?.trim();
	if (override) {
		return path.resolve(override);
	}
	if (process.platform === "win32") {
		const appData = process.env["APPDATA"];
		if (!appData) {
			throw new Error(
				`${OVERRIDE_ENV} is unset and %APPDATA% is missing; set ${OVERRIDE_ENV} to your account.env path`,
			);
		}
		return path.join(appData, "cloudflare-alchemy", "account.env");
	}
	if (process.platform === "darwin") {
		return path.join(
			os.homedir(),
			"Library",
			"Application Support",
			"cloudflare-alchemy",
			"account.env",
		);
	}
	const xdg = process.env["XDG_CONFIG_HOME"]?.trim() || path.join(os.homedir(), ".config");
	return path.join(xdg, "cloudflare-alchemy", "account.env");
}

function parseAccountEnvFile(raw: string): Record<string, string> {
	const parsed = parseDotenv(raw);
	const out: Record<string, string> = {};
	for (const key of CLOUDFLARE_ALCHEMY_ACCOUNT_ENV_KEYS) {
		const v = parsed[key];
		if (typeof v === "string" && v.trim() !== "") {
			out[key] = v.trim();
		}
	}
	return out;
}

/** Returns file contents or `""` if missing (path is still {@link resolveCloudflareAlchemyAccountEnvPath}). */
export function readCloudflareAlchemyAccountEnvFile(): string {
	try {
		const p = resolveCloudflareAlchemyAccountEnvPath();
		if (!existsSync(p)) {
			return "";
		}
		return readFileSync(p, "utf8");
	} catch {
		return "";
	}
}

/**
 * Loads `account.env` into `process.env` for the three account keys when the file defines them.
 * **Account file values override** values already set (e.g. from `dotenv-cli` loading a stage dotfile) so machine config stays the single source of truth for those keys locally.
 */
export function loadCloudflareAlchemyAccountEnvIntoProcess(): {
	path: string;
	loadedKeys: CloudflareAlchemyAccountEnvKey[];
} {
	let filePath: string;
	try {
		filePath = resolveCloudflareAlchemyAccountEnvPath();
	} catch {
		return { path: "", loadedKeys: [] };
	}
	if (!existsSync(filePath)) {
		return { path: filePath, loadedKeys: [] };
	}
	const raw = readFileSync(filePath, "utf8");
	const parsed = parseAccountEnvFile(raw);
	const loadedKeys: CloudflareAlchemyAccountEnvKey[] = [];
	for (const key of CLOUDFLARE_ALCHEMY_ACCOUNT_ENV_KEYS) {
		const v = parsed[key];
		if (!v) {
			continue;
		}
		process.env[key] = v;
		loadedKeys.push(key);
	}
	return { path: filePath, loadedKeys };
}

/**
 * Applies account **`CLOUDFLARE_*`** / **`ALCHEMY_STATE_TOKEN`** from `account.env` onto an env bag.
 * **Overrides** existing values for those keys when the account file defines them (stage dotfiles must not win).
 */
export function mergeCloudflareAlchemyAccountEnvInto(
	env: Record<string, string | undefined>,
): Record<string, string | undefined> {
	let filePath: string;
	try {
		filePath = resolveCloudflareAlchemyAccountEnvPath();
	} catch {
		return env;
	}
	if (!existsSync(filePath)) {
		return env;
	}
	const parsed = parseAccountEnvFile(readFileSync(filePath, "utf8"));
	const out = { ...env };
	for (const key of CLOUDFLARE_ALCHEMY_ACCOUNT_ENV_KEYS) {
		const v = parsed[key];
		if (!v) {
			continue;
		}
		out[key] = v;
	}
	return out;
}

/**
 * Ensures the parent directory exists before writing **`account.env`** (interactive setup).
 */
export function ensureCloudflareAlchemyAccountEnvDir(): string {
	const dir = path.dirname(resolveCloudflareAlchemyAccountEnvPath());
	mkdirSync(dir, { recursive: true });
	return dir;
}
