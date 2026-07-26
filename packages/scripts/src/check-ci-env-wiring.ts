/**
 * Guard against the recurring "new env var works in GitHub sync / job env but never
 * reaches Alchemy under Turbo" failure mode.
 *
 * Checks:
 * 1. Root `turbo.json` `globalEnv` lists every syncable secret (+ required variables).
 * 2. Deploy workflows map those keys into job/step `env` (`KEY: ${{ secrets.KEY }}` / vars).
 *
 * See `.agents/skills/workers-env-local/SKILL.md` — "Checklist after changing env or bindings".
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { ALL_REPO_ENV_REQUIREMENTS } from "./collected-env-requirements";

function gitRepoRoot(): string {
	return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
}

const repoRoot = gitRepoRoot();

type TurboJson = {
	globalEnv?: string[];
};

const DEPLOY_WORKFLOWS = [
	".github/workflows/pr-deploy.yml",
	".github/workflows/main-push.yml",
	".github/workflows/prod-deploy.yml",
] as const;

function mustAppearInTurboGlobalEnv(
	req: (typeof ALL_REPO_ENV_REQUIREMENTS)[number],
	alchemyKeys: Set<string>,
): boolean {
	if (req.githubSync === "never") {
		return false;
	}
	if (req.kind === "secret") {
		return true;
	}
	if (req.githubSync === "required") {
		return true;
	}
	// Optional variables: only when Alchemy/deploy code reads them under Turbo.
	return alchemyKeys.has(req.key);
}

function mustAppearInDeployWorkflows(req: (typeof ALL_REPO_ENV_REQUIREMENTS)[number]): boolean {
	return req.githubSync === "required";
}

function collectAlchemyRunEnvKeyMentions(): Set<string> {
	const roots = ["apps", "packages", "durable-objects", "workers", "stacks"];
	const mentions = new Set<string>();
	const visit = (dir: string) => {
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			return;
		}
		for (const name of entries) {
			const full = path.join(dir, name);
			let st: ReturnType<typeof statSync>;
			try {
				st = statSync(full);
			} catch {
				continue;
			}
			if (st.isDirectory()) {
				if (name === "node_modules" || name === ".alchemy" || name === "dist") {
					continue;
				}
				visit(full);
				continue;
			}
			if (name !== "alchemy.run.ts") {
				continue;
			}
			const text = readFileSync(full, "utf8");
			for (const req of ALL_REPO_ENV_REQUIREMENTS) {
				if (text.includes(`"${req.key}"`) || text.includes(`'${req.key}'`)) {
					mentions.add(req.key);
				}
			}
		}
	};
	for (const root of roots) {
		visit(path.join(repoRoot, root));
	}
	return mentions;
}

function workflowMapsKey(workflowText: string, key: string, kind: "secret" | "variable"): boolean {
	const source = kind === "secret" ? "secrets" : "vars";
	// Job/step env lines look like: KEY: ${{ secrets.KEY }}
	const envLine = new RegExp(
		`(?:^|\\n)\\s*${key}:\\s*\\$\\{\\{\\s*${source}\\.${key}\\s*\\}\\}`,
		"m",
	);
	if (envLine.test(workflowText)) {
		return true;
	}
	// Some workflows only reference vars/secrets in `if:` — still count as mapped.
	return workflowText.includes(`${source}.${key}`);
}

function loadTurboGlobalEnv(): Set<string> {
	const raw = readFileSync(path.join(repoRoot, "turbo.json"), "utf8");
	const turbo = JSON.parse(raw) as TurboJson;
	return new Set(turbo.globalEnv ?? []);
}

function main(): void {
	const globalEnv = loadTurboGlobalEnv();
	const alchemyKeys = collectAlchemyRunEnvKeyMentions();
	const missingTurbo: string[] = [];
	const missingWorkflow: { workflow: string; key: string; kind: string; reason: string }[] = [];

	for (const req of ALL_REPO_ENV_REQUIREMENTS) {
		if (mustAppearInTurboGlobalEnv(req, alchemyKeys) && !globalEnv.has(req.key)) {
			missingTurbo.push(`${req.key} (${req.kind}, githubSync=${req.githubSync})`);
		}
	}

	const workflowTexts = new Map(
		DEPLOY_WORKFLOWS.map((rel) => [rel, readFileSync(path.join(repoRoot, rel), "utf8")] as const),
	);

	for (const req of ALL_REPO_ENV_REQUIREMENTS) {
		if (!mustAppearInDeployWorkflows(req)) {
			continue;
		}
		const needsAllDeployWorkflows = alchemyKeys.has(req.key);
		const targets = needsAllDeployWorkflows
			? [...DEPLOY_WORKFLOWS]
			: ([".github/workflows/pr-deploy.yml"] as const);
		for (const rel of targets) {
			const text = workflowTexts.get(rel);
			if (!text || !workflowMapsKey(text, req.key, req.kind)) {
				missingWorkflow.push({
					workflow: rel,
					key: req.key,
					kind: req.kind,
					reason: needsAllDeployWorkflows
						? "referenced from alchemy.run.ts — must map in every deploy workflow"
						: "githubSync=required — must map in pr-deploy at minimum",
				});
			}
		}
	}

	let failed = false;
	if (missingTurbo.length > 0) {
		failed = true;
		console.error(
			"check-ci-env-wiring: keys missing from root turbo.json globalEnv.\n" +
				"Turbo strips undeclared env from `turbo run deploy:*` / child tasks, so Alchemy never binds them.\n" +
				"Add each key to turbo.json → globalEnv (see workers-env-local skill).\n",
		);
		for (const line of missingTurbo) {
			console.error(`  - ${line}`);
		}
		console.error("");
	}

	if (missingWorkflow.length > 0) {
		failed = true;
		console.error(
			"check-ci-env-wiring: deploy workflows do not map these GitHub secrets/vars into job env.\n" +
				"Syncing to the GitHub Environment is not enough — each deploy job/step must set e.g.\n" +
				"  MY_KEY: $" +
				"{{ secrets.MY_KEY }}\n",
		);
		for (const row of missingWorkflow) {
			console.error(`  - ${row.key} (${row.kind}) → ${row.workflow} — ${row.reason}`);
		}
		console.error("");
	}

	if (failed) {
		process.exit(1);
	}

	console.log(
		"check-ci-env-wiring — ok (turbo globalEnv + deploy workflow env maps cover syncable secrets/required vars)\n",
	);
}

main();
