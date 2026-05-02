/**
 * Before `alchemy dev` runs, verify ALCHEMY_PASSWORD can decrypt an existing
 * @secret (v1) in `.alchemy/`. Catches the common “rotated .env, old state” failure early.
 */
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { cancel, intro, isCancel, outro, password, select } from "@clack/prompts";

const skip = process.env["SKIP_ALCHEMY_STATE_PASSWORD_CHECK"] === "1";

type EncryptedV1 = {
	version: "v1";
	ciphertext: string;
	iv: string;
	salt: string;
	tag: string;
};

function isInteractive() {
	if (process.env["CI"] === "true") {
		return false;
	}
	if (process.env["ALCHEMY_STATE_PASSWORD_INTERACTIVE"] === "1") {
		return Boolean(process.stdin.isTTY && process.stdout.isTTY);
	}
	if (process.env["ALCHEMY_STATE_PASSWORD_NO_PROMPT"] === "1") {
		return false;
	}
	if (process.argv.includes("--yes") || process.argv.includes("-y")) {
		return false;
	}
	// Turbo runs this as a dependency of persistent dev tasks; keep that path non-interactive.
	return false;
}

function readRootEnvValue(repoRoot: string, key: string) {
	const env = process.env[key];
	if (env != null && env !== "") {
		return env;
	}
	const file = join(repoRoot, ".env.local");
	if (!existsSync(file)) {
		return undefined;
	}
	const body = readFileSync(file, "utf8");
	const re = new RegExp(`^\\s*${key}\\s*=\\s*(.*)(?:$|\\r?\\n)`, "m");
	const m = re.exec(body);
	if (!m?.[1]) {
		return undefined;
	}
	let v = m[1].trim();
	if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
		v = v.slice(1, -1);
	}
	return v || undefined;
}

function* walkStateJsonFiles(alchemyDir: string): Generator<string> {
	if (!existsSync(alchemyDir)) {
		return;
	}
	for (const name of readdirSync(alchemyDir)) {
		if (name === "miniflare" || name === "pids" || name === "logs") {
			continue;
		}
		const p = join(alchemyDir, name);
		try {
			const s = statSync(p);
			if (s.isDirectory()) {
				yield* walkStateJsonFiles(p);
			} else if (p.endsWith(".json")) {
				yield p;
			}
		} catch {
			// ignore
		}
	}
}

function* findSecretBlobs(v: unknown): Generator<EncryptedV1> {
	if (v == null || typeof v !== "object") {
		return;
	}
	if (Array.isArray(v)) {
		for (const x of v) {
			yield* findSecretBlobs(x);
		}
		return;
	}
	const o = v as Record<string, unknown>;
	if (o["@secret"] && typeof o["@secret"] === "object" && o["@secret"] !== null) {
		const s = o["@secret"] as Record<string, unknown>;
		if (s["version"] === "v1" && typeof s["ciphertext"] === "string") {
			yield s as unknown as EncryptedV1;
		}
	}
	for (const k of Object.keys(o)) {
		yield* findSecretBlobs(o[k]);
	}
}

function loadFirstEncryptedSample(repoRoot: string): EncryptedV1 | null {
	const alchemyDir = join(repoRoot, ".alchemy");
	if (!existsSync(alchemyDir)) {
		return null;
	}
	for (const jf of walkStateJsonFiles(alchemyDir)) {
		try {
			const data: unknown = JSON.parse(readFileSync(jf, "utf8"));
			for (const blob of findSecretBlobs(data)) {
				return blob;
			}
		} catch {
			// continue
		}
	}
	return null;
}

function isProbablyWrongPasswordError(err: unknown) {
	if (!(err instanceof Error)) {
		return true;
	}
	return /auth|decrypt|authenticate|Unsupported state|length/i.test(err.message);
}

async function loadDecryptWithKey(repoRoot: string) {
	const encryptFile = join(repoRoot, "node_modules", "alchemy", "src", "encrypt.ts");
	if (!existsSync(encryptFile)) {
		throw new Error(
			`[dev:preflight] Missing alchemy: ${encryptFile} (bun install at the repo root).`,
		);
	}
	const href = pathToFileURL(encryptFile).href;
	const m: { decryptWithKey?: unknown } = await import(href);
	if (typeof m.decryptWithKey !== "function") {
		throw new Error(
			"[dev:preflight] alchemy encrypt did not export decryptWithKey; update for your Alchemy version.",
		);
	}
	return m.decryptWithKey as (value: EncryptedV1, key: string) => Promise<string>;
}

function upsertAlchemyPasswordInEnvLocal(repoRoot: string, value: string) {
	if (value.includes("\n") || value.includes("\r")) {
		throw new Error("[dev:preflight] ALCHEMY_PASSWORD value must be a single line");
	}
	const file = join(repoRoot, ".env.local");
	const line = `ALCHEMY_PASSWORD=${value}`;
	if (!existsSync(file)) {
		writeFileSync(file, `${line}\n`, "utf8");
		return;
	}
	const text = readFileSync(file, "utf8");
	const re = /^\s*ALCHEMY_PASSWORD\s*=\s*[^\n]*$/m;
	const out = re.test(text) ? text.replace(re, line) : `${text.replace(/\n?$/, "\n")}\n${line}\n`;
	writeFileSync(file, out, "utf8");
}

export async function runAlchemyStatePasswordPreflight(repoRoot: string) {
	if (skip) {
		return;
	}
	const root = resolve(repoRoot);

	const first = loadFirstEncryptedSample(root);
	if (!first) {
		return;
	}

	const decryptWithKey = await loadDecryptWithKey(root);
	const probe = async (pw: string | undefined) => {
		if (pw == null || pw === "") {
			return "no-password" as const;
		}
		try {
			await decryptWithKey(first, pw);
			return "ok" as const;
		} catch (e) {
			if (isProbablyWrongPasswordError(e)) {
				return "bad" as const;
			}
			throw e;
		}
	};

	let passwordVal = readRootEnvValue(root, "ALCHEMY_PASSWORD");

	/* ––– initial probe ––– */
	let result = await probe(passwordVal);
	if (result === "ok") {
		return;
	}
	if (result === "no-password") {
		console.error(
			"\n[dev:preflight] .alchemy/ has encrypted Alchemy state but ALCHEMY_PASSWORD is empty.",
		);
		console.error(
			"  Set it in .env.local (bun run setup) or the environment, or remove .alchemy/ to reset.\n",
		);
		process.exit(1);
	}

	const printNonInteractiveHelp = () => {
		console.error(
			"\n[dev:preflight] ALCHEMY_PASSWORD does not match the key used to encrypt data in .alchemy/ (e.g. `alchemy.secret()` in state).\n",
		);
		console.error(
			"  Usual cause: a new random password in .env.local while .alchemy/ was written with the old one.",
		);
		console.error("  Fix one of these, then run `bun run dev` again:");
		console.error("    1. Put the old ALCHEMY_PASSWORD back in .env.local.");
		console.error("    2. Back up and delete .alchemy/ to reset local Alchemy state.");
		console.error(
			"    3. Run `bun run --cwd packages/scripts dev:preflight:interactive` for prompts.",
		);
		console.error("  Skip: SKIP_ALCHEMY_STATE_PASSWORD_CHECK=1  (not recommended)\n");
	};

	if (!isInteractive()) {
		printNonInteractiveHelp();
		process.exit(1);
	}

	intro("Alchemy local state — encryption password");

	while (true) {
		const next = await select({
			message:
				"Your ALCHEMY_PASSWORD can’t open existing .alchemy/ (wrong key, or state from another machine). What now?",
			options: [
				{ value: "retry" as const, label: "I fixed .env.local — re-check" },
				{
					value: "type" as const,
					label: "Try another password (once, not saved until you say so)",
				},
				{ value: "wipe" as const, label: "Delete .alchemy/ and start clean (local dev only)" },
				{ value: "quit" as const, label: "Exit" },
			],
		});
		if (isCancel(next) || next === "quit") {
			cancel("Exiting. Fix ALCHEMY_PASSWORD or remove .alchemy/ when ready.");
			process.exit(1);
		}
		if (next === "retry") {
			passwordVal = readRootEnvValue(root, "ALCHEMY_PASSWORD");
			result = await probe(passwordVal);
			if (result === "ok") {
				outro("Password matches .alchemy/ — continuing.");
				return;
			}
			if (result === "no-password") {
				console.log("\n[dev:preflight] ALCHEMY_PASSWORD is still empty in env / .env.local\n");
			} else {
				console.log("\n[dev:preflight] Still can’t decrypt with the current value.\n");
			}
			continue;
		}
		if (next === "type") {
			const pw = await password({
				message: "Password to try (only in-memory until you opt in to save)",
				mask: "*",
				validate: (s) => (s?.trim() ? undefined : "Required"),
			});
			if (isCancel(pw)) {
				continue;
			}
			const typed = (pw as string).trim();
			result = await probe(typed);
			if (result === "ok") {
				const okWrite = await select({
					message:
						"That works. Save this as ALCHEMY_PASSWORD in .env.local? (so alchemy dev loads it)",
					options: [
						{ value: "yes" as const, label: "Yes, write .env.local" },
						{ value: "no" as const, label: "No — I’ll set it myself" },
					],
				});
				if (isCancel(okWrite)) {
					continue;
				}
				if (okWrite === "yes") {
					upsertAlchemyPasswordInEnvLocal(root, typed);
					outro("Updated .env.local. Continuing to dev with the new password (same run).");
					return;
				}
				outro(
					"Set the same value as ALCHEMY_PASSWORD in .env.local, then run `bun run dev` again.",
				);
				process.exit(0);
			}
			console.log("\n[dev:preflight] That password did not work.\n");
			continue;
		}
		if (next === "wipe") {
			const alchemyPath = join(root, ".alchemy");
			const really = await select({
				message: `Delete ${alchemyPath} ? (local state / Miniflare caches under it)`,
				options: [
					{ value: "no" as const, label: "No, go back" },
					{ value: "yes" as const, label: "Yes, delete" },
				],
			});
			if (isCancel(really) || really === "no") {
				continue;
			}
			rmSync(alchemyPath, { recursive: true, force: true });
			outro(
				"Removed .alchemy/. Alchemy will recreate local state with your current ALCHEMY_PASSWORD.",
			);
			return;
		}
	}
}
