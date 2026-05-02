/**
 * Idempotent local path: install if needed, fill missing auto-generated `.env.local` keys, then `bun run dev`.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");

const inheritStdio: ["inherit", "inherit", "inherit"] = ["inherit", "inherit", "inherit"];

function runOrExit(cmd: string[], label: string): void {
	const r = Bun.spawnSync(cmd, {
		cwd: root,
		stdio: inheritStdio,
		env: process.env,
	});
	if (r.exitCode !== 0) {
		console.error(`[quickstart] ${label} failed (exit ${r.exitCode ?? 1}).`);
		process.exit(r.exitCode ?? 1);
	}
}

async function main(): Promise<void> {
	if (!existsSync(`${root}/node_modules`)) {
		console.log("[quickstart] Installing dependencies (node_modules missing)…");
		runOrExit(["bun", "install"], "bun install");
	}

	console.log("[quickstart] Ensuring `.env.local` regeneratable keys…");
	runOrExit(["bun", "run", "setup:local", "--", "--yes"], "setup:local --yes");

	console.log("[quickstart] Alchemy state password check…");
	const pre = Bun.spawnSync(["bun", "run", "--cwd", "packages/scripts", "dev:preflight"], {
		cwd: root,
		stdio: inheritStdio,
		env: { ...process.env, ALCHEMY_STATE_PASSWORD_NO_PROMPT: "1" },
	});
	if (pre.exitCode !== 0) {
		console.error("");
		console.error("[quickstart] Dev preflight failed. Fix Alchemy password/state, then rerun.");
		console.error("See: packages/scripts/src/alchemy-state-password-preflight.ts");
		process.exit(pre.exitCode ?? 1);
	}

	console.log("[quickstart] Starting dev stack (`bun run dev`)…");
	const dev = Bun.spawn(["bun", "run", "dev"], {
		cwd: root,
		stdout: "inherit",
		stderr: "inherit",
		stdin: "inherit",
		env: process.env,
	});
	const code = await dev.exited;
	if (code !== 0) {
		console.error("");
		console.error("[quickstart] `bun run dev` exited with an error.");
		console.error("If you see Cloudflare / Alchemy auth issues, from the repo root:");
		console.error("  bun alchemy configure");
		console.error("  bun alchemy login");
		console.error("Optional: add CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID to `.env.local`.");
		console.error("");
		console.error("Then rerun: bun run quickstart");
	}
	process.exit(code);
}

void main().catch((e) => {
	console.error(e);
	process.exit(1);
});
