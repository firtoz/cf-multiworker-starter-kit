/**
 * Local / staging / prod gitignored env bootstrap (ja-ti-style variable browser).
 *
 * Keys come from **`collected-env-requirements.ts`** (repo root + package sidecars). GitHub sync uses the same model via **`github-environment-secrets.ts`**.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as readline from "node:readline";
import { styleText } from "node:util";
import { confirm, intro, isCancel, note, outro, password, select, text } from "@clack/prompts";

import {
	ENV_SETUP_CATEGORY_DESCRIPTION,
	ENV_SETUP_CATEGORY_LABEL,
	ENV_SETUP_CATEGORY_NAV,
	type EnvSetupCategoryId,
	type EnvSetupCategoryNavGroup,
	type EnvSetupMode,
	envFileKeyLooksSet,
	isEnvSetupCategoryNavGroup,
	isOptionalInSetupMode,
	isRequiredInSetupMode,
	requirementByKey,
	type SetupCategoryGroup,
	setupCategoryRequiredSatisfied,
	setupNavigableKeysByCategory,
} from "alchemy-utils/env-requirements";
import { ALL_REPO_ENV_REQUIREMENTS } from "./collected-env-requirements";
import { setupCommandLabelForDotfileRel } from "./github-environment-secrets";
import { GITHUB_POLICY_HINT_LINES } from "./github-policy-hints";

const root = path.resolve(import.meta.dir, "../../..");
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

type SetupMode = EnvSetupMode;

const REQ_BY_KEY = requirementByKey(ALL_REPO_ENV_REQUIREMENTS);

const BACK = "__back__";
const MAIN_EXIT = "__main_exit__";
const BACK_TO_CATEGORIES = "__back_to_categories__";
/** Picks a top-level nav row ({@link ENV_SETUP_CATEGORY_NAV}) — not a leaf category id. */
const NAV_GROUP_PREFIX = "nav:group:";
const NAV_LEAF_PREFIX = "nav:leaf:";
const DOT_ENV_LOCAL = path.join(root, ".env.local");

/** @clack maps Escape and Ctrl+C to the same cancel symbol — use last keypress to tell them apart (prepend listener runs before clack). */
let lastClackKeyMeta: readline.Key | undefined;

function attachClackKeyMetaCapture(): void {
	if (!process.stdin.isTTY) {
		return;
	}
	readline.emitKeypressEvents(process.stdin);
	process.stdin.prependListener("keypress", (_s, key) => {
		lastClackKeyMeta = key;
	});
}

function cancelWasEscape(): boolean {
	return lastClackKeyMeta?.name === "escape";
}

function exitSetupFinished(): never {
	outro("Finished.");
	process.exit(0);
}

function exitSetupInterrupted(): never {
	outro("Interrupted.");
	process.exit(130);
}

function requiredKeysForMode(mode: SetupMode): string[] {
	return ALL_REPO_ENV_REQUIREMENTS.filter((r) => isRequiredInSetupMode(r, mode)).map((r) => r.key);
}

function setupCategoryGroups(mode: SetupMode): SetupCategoryGroup[] {
	return setupNavigableKeysByCategory(mode, ALL_REPO_ENV_REQUIREMENTS);
}

function isOptionalSetupKey(key: string, mode: SetupMode): boolean {
	const r = REQ_BY_KEY.get(key);
	if (!r) {
		return false;
	}
	return isOptionalInSetupMode(r, mode) && !isRequiredInSetupMode(r, mode);
}

function keyTitle(key: string): string {
	return REQ_BY_KEY.get(key)?.title ?? key;
}

function keyLine(key: string): string {
	return REQ_BY_KEY.get(key)?.description ?? `Set \`${key}\` (see .env.example).`;
}

function canAutoGenerateKey(key: string): boolean {
	return REQ_BY_KEY.get(key)?.canAutoGenerate === true;
}

function isMaskedKey(key: string): boolean {
	return !REQ_BY_KEY.get(key)?.plaintextInSetup;
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
	return envFileKeyLooksSet(envText, key);
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

function rowLabelWhenIncomplete(text: string): string {
	return `\u001b[22m${styleText("yellow", text)}\u001b[0m`;
}

function emptyKeyDisplayForSetupList(defaultIfUnset: string | undefined): string {
	if (defaultIfUnset === undefined) {
		return "(empty)";
	}
	return `(empty · default ${defaultIfUnset})`;
}

/** Plain-language default when the key line is absent from the dotfile (setup list only). */
const SETUP_LIST_EMPTY_DEFAULT_HINT: Readonly<Record<string, string>> = {
	GITHUB_SYNC_PUSH_SECRETS: "true (= push secrets & Environment vars to GitHub)",
	GITHUB_SYNC_STAGING_FORK_REVIEWERS_PRIVATE:
		'false (= no actor reviewer on private repos when policy reviewerFallbackToActor is "auto")',
};

function setupCategoryKeySelectMessage(category: EnvSetupCategoryId): string {
	const title = ENV_SETUP_CATEGORY_LABEL[category];
	const blurb = ENV_SETUP_CATEGORY_DESCRIPTION[category]?.trim();
	if (!blurb) {
		return title;
	}
	return `${title}\n${blurb}`;
}

function categorySummaryLine(raw: string, group: SetupCategoryGroup, mode: SetupMode): string {
	const { category, keys } = group;
	const total = keys.length;
	const set = keys.filter((k) => hasValue(raw, k)).length;
	const requiredOk = setupCategoryRequiredSatisfied(raw, mode, ALL_REPO_ENV_REQUIREMENTS, keys);
	const title = ENV_SETUP_CATEGORY_LABEL[category];
	const frac = `${set}/${total}`;
	const line = requiredOk ? `${title} · ${frac}` : `${title} · ${frac} (incomplete)`;
	return requiredOk ? rowLabelWhenSet(line) : rowLabelWhenIncomplete(line);
}

function navGroupById(groupId: string): EnvSetupCategoryNavGroup | undefined {
	for (const root of ENV_SETUP_CATEGORY_NAV) {
		if (isEnvSetupCategoryNavGroup(root) && root.id === groupId) {
			return root;
		}
	}
	return undefined;
}

function navGroupSummaryLine(
	raw: string,
	mode: SetupMode,
	nav: EnvSetupCategoryNavGroup,
	nested: SetupCategoryGroup[],
): string {
	const allKeys = nested.flatMap((g) => g.keys);
	const total = allKeys.length;
	const set = allKeys.filter((k) => hasValue(raw, k)).length;
	const requiredOk = setupCategoryRequiredSatisfied(raw, mode, ALL_REPO_ENV_REQUIREMENTS, allKeys);
	const title = nav.label;
	const frac = `${set}/${total}`;
	const line = requiredOk ? `${title} · ${frac}` : `${title} · ${frac} (incomplete)`;
	return requiredOk ? rowLabelWhenSet(line) : rowLabelWhenIncomplete(line);
}

function setupMainCategoryPicks(
	raw: string,
	mode: SetupMode,
	groups: SetupCategoryGroup[],
): { value: string; label: string }[] {
	const byCat = new Map(groups.map((g) => [g.category, g] as const));
	const picks: { value: string; label: string }[] = [];
	for (const root of ENV_SETUP_CATEGORY_NAV) {
		if (isEnvSetupCategoryNavGroup(root)) {
			const childIds = new Set(root.children.map((c) => c.id));
			const nested = groups.filter((g) => childIds.has(g.category));
			if (nested.length === 0) {
				continue;
			}
			picks.push({
				value: `${NAV_GROUP_PREFIX}${root.id}`,
				label: navGroupSummaryLine(raw, mode, root, nested),
			});
		} else {
			const g = byCat.get(root.id);
			if (!g) {
				continue;
			}
			picks.push({
				value: `${NAV_LEAF_PREFIX}${root.id}`,
				label: categorySummaryLine(raw, g, mode),
			});
		}
	}
	return picks;
}

function setupSubCategoryPicks(
	raw: string,
	mode: SetupMode,
	groups: SetupCategoryGroup[],
	nav: EnvSetupCategoryNavGroup,
): { value: EnvSetupCategoryId; label: string }[] {
	const byCat = new Map(groups.map((g) => [g.category, g] as const));
	const picks: { value: EnvSetupCategoryId; label: string }[] = [];
	for (const child of nav.children) {
		const g = byCat.get(child.id as EnvSetupCategoryId);
		if (!g) {
			continue;
		}
		picks.push({
			value: child.id as EnvSetupCategoryId,
			label: categorySummaryLine(raw, g, mode),
		});
	}
	return picks;
}

function parseMainCategoryPick(
	value: string,
): { kind: "group"; groupId: string } | { kind: "leaf"; categoryId: EnvSetupCategoryId } | null {
	if (value.startsWith(NAV_GROUP_PREFIX)) {
		return { kind: "group", groupId: value.slice(NAV_GROUP_PREFIX.length) };
	}
	if (value.startsWith(NAV_LEAF_PREFIX)) {
		return { kind: "leaf", categoryId: value.slice(NAV_LEAF_PREFIX.length) as EnvSetupCategoryId };
	}
	return null;
}

function rowLabel(raw: string, key: string, mode: SetupMode): string {
	const set = hasValue(raw, key);
	const box = set ? "[x]" : "[ ]";
	const reqWord = isOptionalSetupKey(key, mode) ? "optional" : "required";
	if (!isMaskedKey(key)) {
		const v = captureEnvAssignmentLine(raw, key) ?? "";
		const emptyHint = SETUP_LIST_EMPTY_DEFAULT_HINT[key];
		const show = set
			? truncateForList(v, 42)
			: truncateForList(emptyKeyDisplayForSetupList(emptyHint), 72);
		const line = `${box} ${key} · ${reqWord} · ${show}`;
		return set ? rowLabelWhenSet(line) : line;
	}
	const line = `${box} ${key} · ${reqWord} · ${set ? "set (masked)" : "unset"}`;
	return set ? rowLabelWhenSet(line) : line;
}

/**
 * Nested categories (see {@link ENV_SETUP_CATEGORY_NAV}): top level, optional submenu, then keys.
 * « Back » returns up one level; exit row leaves the browser.
 */
async function variableBrowserLoop(
	file: string,
	mode: SetupMode,
	startRaw: string,
	exitBrowserReturnsToModeMenu: boolean,
): Promise<void> {
	let raw = startRaw;
	const topExitLabel = exitBrowserReturnsToModeMenu ? "« Back · choose environment »" : "« Exit »";

	while (true) {
		raw = reloadFileRaw(file, raw);
		const groups = setupCategoryGroups(mode);
		const catPicks = setupMainCategoryPicks(raw, mode, groups);

		const catSel = await select<string | typeof MAIN_EXIT>({
			message: `${path.basename(file)} — categories`,
			options: [...catPicks, { value: MAIN_EXIT, label: topExitLabel }],
		});
		if (isCancel(catSel)) {
			if (cancelWasEscape()) {
				if (exitBrowserReturnsToModeMenu) {
					return;
				}
				outro(existsSync(file) && readFileSync(file, "utf8").trim() ? "Done." : "Nothing saved.");
				return;
			}
			exitSetupInterrupted();
		}
		if (catSel === MAIN_EXIT) {
			if (exitBrowserReturnsToModeMenu) {
				return;
			}
			outro(existsSync(file) && readFileSync(file, "utf8").trim() ? "Done." : "Nothing saved.");
			return;
		}
		if (!catSel) {
			continue;
		}

		const parsed = parseMainCategoryPick(catSel);
		if (!parsed) {
			continue;
		}

		if (parsed.kind === "leaf") {
			const group = groups.find((g) => g.category === parsed.categoryId);
			if (!group) {
				continue;
			}
			while (true) {
				raw = reloadFileRaw(file, raw);
				const picks = group.keys.map((k) => ({
					value: k,
					label: rowLabel(raw, k, mode),
				}));

				const keySel = await select<string | typeof BACK_TO_CATEGORIES>({
					message: setupCategoryKeySelectMessage(group.category),
					options: [...picks, { value: BACK_TO_CATEGORIES, label: "« Back to categories »" }],
				});
				if (isCancel(keySel)) {
					if (cancelWasEscape()) {
						break;
					}
					exitSetupInterrupted();
				}
				if (keySel === BACK_TO_CATEGORIES) {
					break;
				}
				if (!keySel) {
					continue;
				}
				raw = existsSync(file) ? readFileSync(file, "utf8") : raw;
				const updated = await editOneVariableInteractive(file, raw, mode, keySel);
				raw = reloadFileRaw(file, updated ?? raw);
			}
			continue;
		}

		const nav = navGroupById(parsed.groupId);
		if (!nav) {
			continue;
		}

		while (true) {
			raw = reloadFileRaw(file, raw);
			const subPicks = setupSubCategoryPicks(raw, mode, groups, nav);
			if (subPicks.length === 0) {
				break;
			}

			const subSel = await select<EnvSetupCategoryId | typeof BACK_TO_CATEGORIES>({
				message: `${path.basename(file)} — ${nav.label}`,
				options: [...subPicks, { value: BACK_TO_CATEGORIES, label: "« Back · main categories »" }],
			});
			if (isCancel(subSel)) {
				if (cancelWasEscape()) {
					break;
				}
				exitSetupInterrupted();
			}
			if (subSel === BACK_TO_CATEGORIES) {
				break;
			}
			if (!subSel) {
				continue;
			}

			const group = groups.find((g) => g.category === subSel);
			if (!group) {
				continue;
			}

			while (true) {
				raw = reloadFileRaw(file, raw);
				const picks = group.keys.map((k) => ({
					value: k,
					label: rowLabel(raw, k, mode),
				}));

				const keySel = await select<string | typeof BACK_TO_CATEGORIES>({
					message: setupCategoryKeySelectMessage(group.category),
					options: [...picks, { value: BACK_TO_CATEGORIES, label: `« Back · ${nav.label} »` }],
				});
				if (isCancel(keySel)) {
					if (cancelWasEscape()) {
						break;
					}
					exitSetupInterrupted();
				}
				if (keySel === BACK_TO_CATEGORIES) {
					break;
				}
				if (!keySel) {
					continue;
				}
				raw = existsSync(file) ? readFileSync(file, "utf8") : raw;
				const updated = await editOneVariableInteractive(file, raw, mode, keySel);
				raw = reloadFileRaw(file, updated ?? raw);
			}
		}
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
		if (choice === BACK) {
			return raw;
		}
		if (isCancel(choice)) {
			if (cancelWasEscape()) {
				return raw;
			}
			exitSetupInterrupted();
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
					if (cancelWasEscape()) {
						return raw;
					}
					exitSetupInterrupted();
				}
				nextRaw = upsertPlainEnvKv(raw, key, pw.trim());
			} else {
				const cur = captureEnvAssignmentLine(raw, key) ?? "";
				const ans = await text({
					message: `${keyTitle(key)} (${key})\n${keyLine(key)}`,
					defaultValue: cur,
				});
				if (isCancel(ans)) {
					if (cancelWasEscape()) {
						return raw;
					}
					exitSetupInterrupted();
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
				message: isOptionalSetupKey(key, mode)
					? `Remove ${key} from ${path.basename(file)}? This is optional — set again if you still need it.`
					: `Remove ${key} from ${path.basename(file)}? Required for deploy / GitHub sync.`,
				initialValue: false,
			});
			if (isCancel(okConfirm)) {
				if (cancelWasEscape()) {
					continue;
				}
				exitSetupInterrupted();
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
	if (isCancel(choice)) {
		if (cancelWasEscape()) {
			return null;
		}
		exitSetupInterrupted();
	}
	if (!choice) {
		return null;
	}
	return choice;
}

function isModeLockedByCliFlag(): boolean {
	return isProd || isStaging || isLocalFlag;
}

/** Dotfile + mode when argv pins the mode, or non-interactive default local — not used for bare `bun run setup`. */
function resolveLockedModeAndFile(): { mode: SetupMode; file: string } | null {
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
	return null;
}

async function interactiveMain(
	file: string,
	mode: SetupMode,
	options?: { exitBrowserReturnsToModeMenu?: boolean },
): Promise<void> {
	const raw = existsSync(file) ? readFileSync(file, "utf8") : "";
	const rel = path.relative(root, file) || path.basename(file);
	const setupCli = setupCommandLabelForDotfileRel(rel);
	const title = `${setupCli} — ${path.basename(file)}`;
	intro(flagEdit ? `env · ${title}` : `env · ${title}`);
	if (mode !== "local") {
		const extra =
			mode === "staging"
				? [
						"",
						"**Fork PR previews** use GitHub Environment **`staging-fork`**. **`github:sync:staging`** mirrors secrets/vars there. Deployment rules for **`staging`**, **`production`**, and **`staging-fork`** are in **`config/github.policy.ts`** (not this dotfile).",
						"",
						...GITHUB_POLICY_HINT_LINES,
					]
				: ["", ...GITHUB_POLICY_HINT_LINES];
		note(
			[
				"GitHub sync uses **secrets** for Alchemy password, **`ALCHEMY_STATE_TOKEN`** (Cloudflare-backed deploy state), chatroom secret, and Cloudflare API token.",
				"**CLOUDFLARE_ACCOUNT_ID** is stored as a GitHub Environment **variable** (`github:sync:*`).",
				"",
				"**GitHub repo policy** — merge buttons, **repository rulesets**, and Environment deployment protection — is edited in **`config/github.policy.ts`** (TypeScript). It is applied when you run **`bun run github:env:*`** or during **`github:sync:staging`** (repo + rulesets).",
				"Optional **`GITHUB_SYNC_PUSH_SECRETS`**: omit or leave empty → **`true`** (pushes secrets/vars). Set **`false`** or use **`bun run github:sync:config`** for shells + policy only (**`GITHUB_SYNC_UPDATE_ENVIRONMENT_PROTECTION`** defaults **`false`**; only **`true`** reapplies deployment rules during sync — see **`.env.example`**).",
				"Optional: **`WEB_DOMAINS`**, **`WEB_ROUTES`**, **`WEB_ZONE_ID`**, **`WEB_DOMAIN_OVERRIDE_EXISTING_ORIGIN`** — Workers custom hostnames · see README *Custom domains*.",
				"Optional product analytics (**`POSTHOG_*`**) in this file sync as GitHub Environment **variables** (and **`POSTHOG_CLI_TOKEN`** as a **secret**) when you run `github:sync:staging|prod`; deploy workflows pass them into **Turbo**. Leave blank to skip or remove the block from `env.requirements.ts` if you do not want PostHog at all.",
				...extra,
				"",
				`When ready: \`bun run github:sync:${mode === "staging" ? "staging" : "prod"}\` (after \`gh auth login\`).`,
			].join("\n"),
			"Deploy keys",
		);
	}
	await variableBrowserLoop(file, mode, raw, options?.exitBrowserReturnsToModeMenu ?? false);
}

async function main(): Promise<void> {
	const interactive = useInteractivePrompt();
	if (interactive) {
		attachClackKeyMetaCapture();
	}

	/** Bare `bun run setup`: loop env picker; exiting the variable browser returns here (no `outro`). */
	if (interactive && !isModeLockedByCliFlag() && !flagEdit) {
		while (true) {
			const mode = await chooseSetupModeInteractive();
			if (mode == null) {
				exitSetupFinished();
			}
			const file = fileForMode(mode);
			const body = existsSync(file) ? readFileSync(file, "utf8") : "";
			const missing = requiredKeysForMode(mode).filter((k) => !hasValue(body, k));
			if (missing.length > 0) {
				intro("env — missing keys");
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
			await interactiveMain(file, mode, { exitBrowserReturnsToModeMenu: true });
		}
	}

	const locked = resolveLockedModeAndFile();
	if (locked == null) {
		// `bun run setup --edit` (no `--local` / `--staging` / `--prod`)
		if (!flagEdit) {
			exitSetupFinished();
		}
		const mode = await chooseSetupModeInteractive();
		if (mode == null) {
			exitSetupFinished();
		}
		const file = fileForMode(mode);
		const raw = existsSync(file) ? readFileSync(file, "utf8") : "";
		intro("env — update env");
		await variableBrowserLoop(file, mode, raw, false);
		return;
	}

	const { mode, file } = locked;
	const requiredKeys = requiredKeysForMode(mode);
	const body = existsSync(file) ? readFileSync(file, "utf8") : "";
	const missing = requiredKeys.filter((k) => !hasValue(body, k));

	if (!interactive) {
		if (missing.length > 0) {
			if (forceNonInteractive) {
				maybeProvisionNoninteractive(missing, body, file);
				return;
			}
			console.error(
				`[setup] Non-TTY: ${missing.join(", ")} missing in ${path.basename(file)}. Run in a terminal or use --yes to auto-generate regeneratable keys.`,
			);
			process.exit(1);
		}
		if (flagEdit && forceNonInteractive) {
			const rotatable = requiredKeys.filter(canAutoGenerateKey);
			if (rotatable.length === 0) {
				console.error("[setup] --edit --yes: no auto-regeneratable keys — run interactively.");
				process.exit(1);
			}
			const fresh = Object.fromEntries(rotatable.map((k) => [k, gen()])) as Record<string, string>;
			const out = upsertEnvLines(body, fresh, rotatable);
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
		for (const k of requiredKeys.filter(canAutoGenerateKey)) {
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
		intro("env — update env");
		await variableBrowserLoop(file, mode, raw, false);
		return;
	}

	if (missing.length > 0) {
		intro("env — missing keys");
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
