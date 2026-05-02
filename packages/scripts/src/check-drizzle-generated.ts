import { execFileSync } from "node:child_process";

const baseArg = process.argv.find((arg) => arg.startsWith("--base="))?.slice("--base=".length);
const githubBaseRef = process.env["GITHUB_BASE_REF"];
const baseRef = baseArg ?? (githubBaseRef ? `origin/${githubBaseRef}` : "origin/main");

function git(args: string[]): string {
	return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function listChangedFiles(): string[] {
	try {
		git(["rev-parse", "--verify", baseRef]);
	} catch {
		if (process.env["GITHUB_ACTIONS"] === "true") {
			console.log(
				`::warning::Could not resolve ${baseRef}; skipping Drizzle generated-artifact check.`,
			);
		} else {
			console.warn(`Could not resolve ${baseRef}; skipping Drizzle generated-artifact check.`);
		}
		return [];
	}
	const output = git(["diff", "--name-only", `${baseRef}...HEAD`]);
	return output.length === 0 ? [] : output.split("\n").filter(Boolean);
}

function packageRoot(file: string): string | null {
	const match = /^(packages\/[^/]+|durable-objects\/[^/]+)\/drizzle\//.exec(file);
	return match?.[1] ?? null;
}

function isGeneratedDrizzle(file: string): boolean {
	return /^(packages\/[^/]+|durable-objects\/[^/]+)\/drizzle\/(?:[^/]+\.(?:sql|js)|meta\/.+\.json)$/.test(
		file,
	);
}

function isSchemaOrGeneratorInput(file: string, root: string): boolean {
	return (
		file === `${root}/src/schema.ts` ||
		file === `${root}/drizzle.config.ts` ||
		file === `${root}/package.json` ||
		file === `${root}/turbo.json`
	);
}

const changedFiles = listChangedFiles();
const generatedFiles = changedFiles.filter(isGeneratedDrizzle);
const roots = new Set(
	generatedFiles.map(packageRoot).filter((root): root is string => root !== null),
);

for (const root of roots) {
	const generatedInRoot = generatedFiles.filter((file) => file.startsWith(`${root}/`));
	const hasSourceChange = changedFiles.some((file) => isSchemaOrGeneratorInput(file, root));
	if (hasSourceChange) {
		continue;
	}
	const message = [
		`Drizzle generated artifacts changed under ${root}/drizzle without a matching schema or generator input change.`,
		"Do not hand-author migration SQL, meta snapshots, or DO migration wrappers.",
		`Generated files: ${generatedInRoot.join(", ")}`,
	].join(" ");
	if (process.env["GITHUB_ACTIONS"] === "true") {
		console.log(`::warning title=Drizzle generated artifacts::${message}`);
	} else {
		console.warn(`Warning: ${message}`);
	}
}
