/**
 * One obvious block in **`alchemy deploy`** logs so CI greps like **`PostHog source maps`** always find something.
 * On GitHub Actions, also writes **`.alchemy/ci/posthog-sourcemaps-summary.md`** for the job summary. Never log secret values.
 */
import { writePosthogSourcemapsCiSummary } from "./ci-summary-artifact";

export function logPosthogSourcemapsAlchemyPlan(args: {
	readonly stage: string;
	readonly runUploadAfterClientBuild: boolean;
}): void {
	const { stage, runUploadAfterClientBuild } = args;
	const width = 72;
	const rule = "=".repeat(width);
	const lines: string[] = ["", rule, "PostHog — source maps / CLI upload (web @ alchemy.run.ts)"];

	const ciMd: string[] = [
		"### PostHog source maps",
		"",
		"**Alchemy plan** (`alchemy.run.ts`, before the web worker build)",
		"",
	];

	if (stage === "local") {
		lines.push("  RESULT: OFF for this stack (STAGE=local)");
		lines.push(
			"  NOTE:   No hidden Vite maps and no posthog/upload-sourcemaps.ts in the build chain.",
		);
		ciMd.push("- **STAGE:** `local`");
		ciMd.push("- **Hidden Vite maps / CLI upload:** no (local dev stack)");
	} else if (runUploadAfterClientBuild) {
		lines.push("  RESULT: ON");
		lines.push(
			"  → Vite emits hidden client .map (when STAGE is non-local and CLI env is complete).",
		);
		lines.push("  → After react-router build, runs: bun posthog/upload-sourcemaps.ts");
		ciMd.push(`- **STAGE:** \`${stage}\``);
		ciMd.push(
			"- **Hidden client source maps (`vite build`):** yes (when CLI env is complete in the build process)",
		);
		ciMd.push("- **`posthog/upload-sourcemaps.ts` after client build:** yes");
	} else {
		lines.push("  RESULT: OFF — posthog-cli upload will NOT run (build is react-router only)");
		const hasToken = Boolean(
			process.env["POSTHOG_CLI_TOKEN"]?.trim() || process.env["POSTHOG_CLI_API_KEY"]?.trim(),
		);
		const hasProject = Boolean(
			process.env["POSTHOG_CLI_ENV_ID"]?.trim() || process.env["POSTHOG_CLI_PROJECT_ID"]?.trim(),
		);
		if (!hasToken) {
			lines.push(
				"  NEED:   POSTHOG_CLI_TOKEN or POSTHOG_CLI_API_KEY (GitHub Environment secret + workflow env + turbo globalEnv)",
			);
		}
		if (!hasProject) {
			lines.push(
				"  NEED:   POSTHOG_CLI_ENV_ID or POSTHOG_CLI_PROJECT_ID (GitHub Environment variable + workflow env + turbo globalEnv)",
			);
		}
		lines.push("  REF:    apps/web/posthog/upload-sourcemaps.ts · .env.example");
		ciMd.push(`- **STAGE:** \`${stage}\``);
		ciMd.push("- **Hidden client source maps:** no (incomplete PostHog CLI env in this process)");
		ciMd.push(
			"- **`posthog/upload-sourcemaps.ts`:** will not run (build command is `react-router build` only)",
		);
		if (!hasToken) {
			ciMd.push("- **Missing:** `POSTHOG_CLI_TOKEN` (or `POSTHOG_CLI_API_KEY`)");
		}
		if (!hasProject) {
			ciMd.push("- **Missing:** `POSTHOG_CLI_ENV_ID` (or `POSTHOG_CLI_PROJECT_ID`)");
		}
		ciMd.push("- **Docs:** `apps/web/posthog/upload-sourcemaps.ts`, `.env.example`");
	}

	lines.push(rule, "");
	console.log(lines.join("\n"));

	writePosthogSourcemapsCiSummary(ciMd.join("\n"));
}
