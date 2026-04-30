/**
 * Local / staging / prod gitignored env bootstrap (ja-ti-style variable browser).
 *
 * - **`bun run setup`** or **`bun run setup:local`** → **`.env.local`** (default non-interactive).
 * - **`bun run setup:staging`** → **`.env.staging`**
 * - **`bun run setup:prod`** → **`.env.production`**
 *
 * Keys align with **`github-environment-secrets.ts`** (four GitHub secrets incl. **`ALCHEMY_STATE_TOKEN`**) plus **`CLOUDFLARE_ACCOUNT_ID`** for sync/variables).
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { styleText } from "node:util";
import {
	cancel,
	confirm,
	intro,
	isCancel,
	note,
	outro,
	password,
	select,
	text,
} from "@clack/prompts";

import { setupCommandLabelForDotfileRel } from "./github-environment-secrets";

const root = path.resolve(import.meta.dir, "../..");
const argv = process.argv;
const isProd = argv.includes("--prod");
const isStaging = argv.includes("--staging");
const isLocalFlag = argv.includes("--local");
if ((isProd ? 1 : 0) + (isStaging ? 1 : 0) + (isLocalFlag ? 1 : 0) > 1) {
	console.error("[setup] Pass at most one of --prod, --staging, or --local.");
	process.exit(2);
}

const flagEdit = argv.includes("--edit");
const forceNonInteractive = argv.includes("--yes") || argv.includes("-y");

type SetupMode = "local" | "staging" | "prod";

const KEYS_LOCAL = ["ALCHEMY_PASSWORD", "CHATROOM_INTERNAL_SECRET"] as const;
const KEYS_DEPLOY = [
	"ALCHEMY_PASSWORD",
	"ALCHEMY_STATE_TOKEN",
	"CHATROOM_INTERNAL_SECRET",
	"CLOUDFLARE_API_TOKEN",
	"CLOUDFLARE_ACCOUNT_ID",
] as const;

const BACK = "__back__";
const MAIN_EXIT = "__main_exit__";
const DOT_ENV_LOCAL = path.join(root, ".env.local");

const KEY_COPY: Readonly<Record<string, { title: string; line: string }>> = {
	ALCHEMY_PASSWORD: {
		title: "Alchemy password",
		line: "Encrypts Alchemy state on disk / in CI (see https://alchemy.run/concepts/secret/#encryption-password).",
	},
	ALCHEMY_STATE_TOKEN: {
		title: "Alchemy Cloud state token",
		line: "One stable token per Cloudflare account for CI state (see https://alchemy.run/guides/cloudflare-state-store/); same value in staging + prod github:sync secrets",
	},
	CHATROOM_INTERNAL_SECRET: {
		title: "Chatroom internal secret",
		line: "Authorizes the web worker when it forwards WebSocket upgrades to the chatroom DO",
	},
	CLOUDFLARE_API_TOKEN: {
		title: "Cloudflare API token",
		line: "Workers + D1 — e.g. Edit Cloudflare Workers template",
	},
	CLOUDFLARE_ACCOUNT_ID: {
		title: "Cloudflare account ID",
		line: "Dashboard → account / Workers overview (synced as a GitHub Environment variable)",
	},
};

function secretKeysForMode(mode: SetupMode): readonly string[] {
	return mode === "local" ? KEYS_LOCAL : KEYS_DEPLOY;
}

function navigableKeys(mode: SetupMode): string[] {
	return [...secretKeysForMode(mode)];
}

function setupCommandLabel(mode: SetupMode): string {
	if (mode === "local") {
		return "bun run setup:local";
	}
	if (mode === "staging") {
		return "bun run setup:staging";
	}
	return "bun run setup:prod";
}

function fileForMode(mode: SetupMode): string {
	if (mode === "local") {
		return path.join(root, ".env.local");
	}
	if (mode === "staging") {
		return path.join(root, ".env.staging");
	}
	return path.join(root, ".env.production");
}

function alchemyPasswordStateHint(): string {
	return " If .alchemy/ was created with a previous password, run `rm -rf .alchemy` at the repository root (then deploy or dev) or you may see Alchemy AES decrypt / authenticate errors.";
}

function useInteractivePrompt(): boolean {
	if (forceNonInteractive) {
		return false;
	}
	if (process.env["CI"] === "true") {
		return false;
	}
	return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function gen(): string {
	return randomBytes(32).toString("base64url");
}

function hasValue(envText: string, key: string): boolean {
	return new RegExp(`^\\s*${key}\\s*=\\s*\\S`, "m").test(envText);
}

function captureEnvAssignmentLine(raw: string, key: string): string | undefined {
	const re = new RegExp(`^\\s*${key}\\s*=\\s*([^\\n]*)`, "m");
	const m = re.exec(raw);
	return m?.[1]?.trim();
}

function readDotEnvLocalValue(key: string): string | undefined {
	if (!existsSync(DOT_ENV_LOCAL)) {
		return undefined;
	}
	const v = captureEnvAssignmentLine(readFileSync(DOT_ENV_LOCAL, "utf8"), key)?.trim();
	return v || undefined;
}

function truncateForList(s: string, max = 52): string {
	const t = s.replace(/\s+/g, " ").trim();
	if (t.length <= max) {
		return t;
	}
	return `${t.slice(0, max - 3)}…`;
}

function keyTitle(key: string): string {
	return KEY_COPY[key]?.title ?? key;
}

function keyLine(key: string): string {
	return KEY_COPY[key]?.line ?? `Set \`${key}\` (see .env.example).`;
}

function canAutoGenerateKey(key: string): boolean {
	return (
		key === "ALCHEMY_PASSWORD" ||
		key === "ALCHEMY_STATE_TOKEN" ||
		key === "CHATROOM_INTERNAL_SECRET"
	);
}

function isMaskedKey(key: string): boolean {
	return key !== "CLOUDFLARE_ACCOUNT_ID";
}

function reloadFileRaw(file: string, fallback: string): string {
	return existsSync(file) ? readFileSync(file, "utf8") : fallback;
}

function upsertPlainEnvKv(text: string, key: string, value: string): string {
	if (value.includes("\n") || value.includes("\r")) {
		throw new Error(`Refusing to write ${key}: value must be a single line.`);
	}
	let out = text;
	const line = `${key}=${value}`;
	const re = new RegExp(`^\\s*${key}\\s*=\\s*[^\\n]*$`, "m");
	if (re.test(out)) {
		return out.replace(re, line);
	}
	if (out && !out.endsWith("\n")) {
		out += "\n";
	}
	return `${out}${line}\n`;
}

function stripEnvKey(text: string, key: string): string {
	let out = text.replace(new RegExp(`^\\s*${key}\\s*=\\s*[^\\n]*(?:\\r?\\n)?`, "gm"), "");
	if (out.length > 0 && !out.endsWith("\n")) {
		out += "\n";
	}
	return out;
}

/**
 * In `select`, inactive rows are wrapped in `dim` by @clack/prompts. Reset faint (`22`) so
 * green stays clearly readable on those lines while the surrounding row styling still applies.
 */
function rowLabelWhenSet(text: string): string {
	return `\u001b[22m${styleText("green", text)}\u001b[0m`;
}

function rowLabel(raw: string, key: string): string {
	const set = hasValue(raw, key);
	const box = set ? "[x]" : "[ ]";
	if (!isMaskedKey(key)) {
		const v = captureEnvAssignmentLine(raw, key) ?? "";
		const show = truncateForList(v || "(empty)", 42);
		const line = `${box} ${key} · required · ${show}`;
		return set ? rowLabelWhenSet(line) : line;
	}
	const line = `${box} ${key} · required · ${set ? "set (masked)" : "unset"}`;
	return set ? rowLabelWhenSet(line) : line;
}

/** One screen: every key with state, then « Exit ». */
async function variableBrowserLoop(file: string, mode: SetupMode, startRaw: string): Promise<void> {
	let raw = startRaw;
	const keys = navigableKeys(mode);

	while (true) {
		raw = reloadFileRaw(file, raw);
		const picks = keys.map((k) => ({
			value: k,
			label: rowLabel(raw, k),
		}));

		const sel = await select<string | typeof MAIN_EXIT>({
			message: path.basename(file),
			options: [...picks, { value: MAIN_EXIT, label: "« Exit »" }],
		});
		if (isCancel(sel)) {
			cancel("Setup cancelled.");
			process.exit(0);
		}
		if (sel === MAIN_EXIT) {
			outro(existsSync(file) && readFileSync(file, "utf8").trim() ? "Done." : "Nothing saved.");
			return;
		}
		if (!sel) {
			continue;
		}
		raw = existsSync(file) ? readFileSync(file, "utf8") : raw;
		const updated = await editOneVariableInteractive(file, raw, mode, sel);
		raw = reloadFileRaw(file, updated ?? raw);
	}
}

async function editOneVariableInteractive(
	file: string,
	raw: string,
	mode: SetupMode,
	key: string,
): Promise<string | null> {
	while (true) {
		const canRand = canAutoGenerateKey(key);
		const set = hasValue(raw, key);
		const masked = isMaskedKey(key);
		const copyFromLocal = (mode === "staging" || mode === "prod") && readDotEnvLocalValue(key);

		const ops: Array<{ value: string; label: string }> = [];
		if (canRand) {
			ops.push({ value: "random", label: set ? "Regenerate random" : "Generate random" });
		}
		if (copyFromLocal) {
			ops.push({
				value: "copyLocal",
				label: masked
					? "Copy from .env.local · (local key set)"
					: `Copy from .env.local · ${truncateForList(copyFromLocal, 36)}`,
			});
		}
		ops.push({
			value: masked ? "manual" : "text",
			label: masked ? "Set / paste manually (masked)" : "Edit value (plaintext — shown)",
		});
		if (set) {
			ops.push({
				value: "clear",
				label: "Clear assignment (risky)",
			});
		}
		ops.push({ value: BACK, label: "« Back »" });

		const choice = await select<string>({
			message: `${keyTitle(key)} (${key})\n${keyLine(key)}`,
			options: ops,
		});
		if (isCancel(choice) || choice === BACK) {
			return raw;
		}

		let nextRaw = raw;
		if (choice === "random") {
			if (!canRand) {
				continue;
			}
			nextRaw = upsertPlainEnvKv(raw, key, gen());
			writeFileSync(file, nextRaw, "utf8");
			if (key === "ALCHEMY_PASSWORD") {
				note(`Updated ${key}.${alchemyPasswordStateHint()}`, path.basename(file));
			}
			return nextRaw;
		}

		if (choice === "copyLocal") {
			const v = readDotEnvLocalValue(key);
			if (!v) {
				note(`${key}: no non-empty value in ${path.basename(DOT_ENV_LOCAL)}.`, path.basename(file));
				continue;
			}
			nextRaw = upsertPlainEnvKv(raw, key, v);
			writeFileSync(file, nextRaw, "utf8");
			note(
				`${key} copied from ${path.basename(DOT_ENV_LOCAL)} → ${path.basename(file)}.`,
				path.basename(file),
			);
			return nextRaw;
		}

		if (choice === "manual" || choice === "text") {
			if (masked) {
				const pw = await password({
					message: `${keyTitle(key)} (${key})`,
					mask: "*",
					validate: (s) => (s?.trim() ? undefined : "Paste a value (or « Back »)"),
				});
				if (isCancel(pw)) {
					return raw;
				}
				nextRaw = upsertPlainEnvKv(raw, key, pw.trim());
			} else {
				const cur = captureEnvAssignmentLine(raw, key) ?? "";
				const ans = await text({
					message: `${keyTitle(key)} (${key})\n${keyLine(key)}`,
					defaultValue: cur,
				});
				if (isCancel(ans)) {
					return raw;
				}
				nextRaw = upsertPlainEnvKv(raw, key, ans.trim());
			}
			writeFileSync(file, nextRaw, "utf8");
			if (key === "ALCHEMY_PASSWORD") {
				note(`Updated ${key}.${alchemyPasswordStateHint()}`, path.basename(file));
			}
			return nextRaw;
		}

		if (choice === "clear") {
			const okConfirm = await confirm({
				message: `Remove ${key} from ${path.basename(file)}? Required for deploy / GitHub sync.`,
				initialValue: false,
			});
			if (isCancel(okConfirm)) {
				continue;
			}
			if (okConfirm) {
				nextRaw = stripEnvKey(raw, key);
				writeFileSync(file, nextRaw, "utf8");
				note(`${key} removed.`, path.basename(file));
				return nextRaw;
			}
			continue;
		}
		return raw;
	}
}

function upsertEnvLines(
	text: string,
	pairs: Readonly<Partial<Record<string, string>>>,
	keys: readonly string[],
): string {
	let out = text;
	for (const key of keys) {
		const value = pairs[key];
		if (value === undefined) {
			continue;
		}
		out = upsertPlainEnvKv(out, key, value);
	}
	return out;
}

function maybeProvisionNoninteractive(
	missingKeys: readonly string[],
	body: string,
	file: string,
): void {
	const unmakable = missingKeys.filter((k) => !canAutoGenerateKey(k));
	if (unmakable.length > 0) {
		const rel = path.basename(file);
		console.error(
			`[setup] Non-interactive (--yes): missing ${unmakable.join(", ")}. Run interactively (no --yes), or paste into ${rel} / see .env.example.`,
		);
		process.exit(1);
	}
	let out = body;
	for (const k of missingKeys) {
		out = upsertPlainEnvKv(out, k, gen());
	}
	writeFileSync(file, out, "utf8");
	console.log(
		`[setup] Wrote regeneratable keys in ${path.basename(file)}.${alchemyPasswordStateHint()}`,
	);
}

async function chooseSetupModeInteractive(): Promise<SetupMode | null> {
	const choice = await select<SetupMode>({
		message: "Which environment do you want to set up?",
		options: [
			{
				value: "local" as const,
				label: "Local dev (.env.local) — no Cloudflare keys required",
			},
			{
				value: "staging" as const,
				label: "Staging / PR previews (.env.staging)",
			},
			{
				value: "prod" as const,
				label: "Production (.env.production)",
			},
		],
		initialValue: "local",
	});
	if (isCancel(choice) || !choice) {
		return null;
	}
	return choice;
}

async function resolveModeAndFile(): Promise<{ mode: SetupMode; file: string } | null> {
	if (isProd) {
		return { mode: "prod", file: fileForMode("prod") };
	}
	if (isStaging) {
		return { mode: "staging", file: fileForMode("staging") };
	}
	if (isLocalFlag) {
		return { mode: "local", file: fileForMode("local") };
	}
	if (!useInteractivePrompt()) {
		return { mode: "local", file: fileForMode("local") };
	}
	const mode = await chooseSetupModeInteractive();
	if (mode == null) {
		return null;
	}
	return { mode, file: fileForMode(mode) };
}

async function interactiveMain(file: string, mode: SetupMode): Promise<void> {
	const raw = existsSync(file) ? readFileSync(file, "utf8") : "";
	const rel = path.relative(root, file) || path.basename(file);
	const setupCli = setupCommandLabelForDotfileRel(rel);
	const title = `${setupCli} — ${path.basename(file)}`;
	intro(flagEdit ? `cf-starter · env · ${title}` : `cf-starter · env · ${title}`);
	if (mode !== "local") {
		note(
			[
				"GitHub sync uses **secrets** for Alchemy password, **`ALCHEMY_STATE_TOKEN`** (Cloudflare-backed deploy state), chatroom secret, and Cloudflare API token.",
				"**CLOUDFLARE_ACCOUNT_ID** is stored as a GitHub Environment **variable** (`github:sync:*`).",
				"",
				`When ready: \`bun run github:sync:${mode === "staging" ? "staging" : "prod"}\` (after \`gh auth login\`).`,
			].join("\n"),
			"Deploy keys",
		);
	}
	await variableBrowserLoop(file, mode, raw);
}

async function main(): Promise<void> {
	const resolved = await resolveModeAndFile();
	if (resolved == null) {
		cancel("Setup cancelled.");
		process.exit(0);
	}
	const { mode, file } = resolved;
	const SECRET_KEYS = secretKeysForMode(mode);
	const body = existsSync(file) ? readFileSync(file, "utf8") : "";
	const missing = SECRET_KEYS.filter((k) => !hasValue(body, k));
	const interactive = useInteractivePrompt();

	if (!interactive) {
		if (missing.length > 0) {
			if (forceNonInteractive) {
				maybeProvisionNoninteractive(missing, body, file);
				return;
			}
			console.error(
				`[setup] Non-TTY: ${missing.join(", ")} missing in ${path.basename(file)}. Run in a terminal or use --yes to auto-generate Alchemy/chatroom secrets only.`,
			);
			process.exit(1);
		}
		if (flagEdit && forceNonInteractive) {
			const rotatable = SECRET_KEYS.filter(canAutoGenerateKey);
			if (rotatable.length === 0) {
				console.error("[setup] --edit --yes: no auto-regeneratable keys — run interactively.");
				process.exit(1);
			}
			const fresh = Object.fromEntries(rotatable.map((k) => [k, gen()])) as Record<string, string>;
			const out = upsertEnvLines(body, fresh, SECRET_KEYS);
			writeFileSync(file, out, "utf8");
			console.log(
				`[setup] --edit --yes: rotated ${rotatable.join(", ")} in ${file}.${alchemyPasswordStateHint()}`,
			);
			return;
		}
		if (flagEdit && !forceNonInteractive) {
			console.error(
				"[setup] --edit in non-TTY needs --yes to rotate, or run in a real terminal for menus.",
			);
			process.exit(1);
		}
		const lines: string[] = [
			`[setup] ${file}`,
			`[setup] All required keys are present. Open a TTY for the variable browser, or:`,
		];
		for (const k of SECRET_KEYS.filter(canAutoGenerateKey)) {
			lines.push(`[setup] • ${keyTitle(k)} (${k})`);
		}
		lines.push(`[setup] ${setupCommandLabel(mode)} -- --edit --yes`);
		for (const line of lines) {
			console.log(line);
		}
		return;
	}

	if (flagEdit) {
		const raw = existsSync(file) ? readFileSync(file, "utf8") : "";
		intro("cf-starter — update env");
		await variableBrowserLoop(file, mode, raw);
		return;
	}

	if (missing.length > 0) {
		intro("cf-starter — missing keys");
		note(
			[
				`These keys are not set in ${path.basename(file)}:`,
				"",
				...missing.map((k) => `• ${keyTitle(k)} — \`${k}\``),
				"",
				"You can generate random values for Alchemy + chatroom secrets from the next screens.",
			].join("\n"),
			"Incomplete file",
		);
	}

	await interactiveMain(file, mode);
}

await main();
