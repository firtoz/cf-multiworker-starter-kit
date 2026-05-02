import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { PlopTypes } from "@turbo/gen";

export default function generator(plop: PlopTypes.NodePlopAPI): void {
	plop.setGenerator("durable-object", {
		description:
			"Generate a typed Hono Durable Object package with its own package-local Alchemy app.",
		prompts: [
			{
				type: "input",
				name: "name",
				message: "What is the name of the Durable Object (e.g., 'user-session')?",
				validate: (input: string) => {
					if (input.includes(" ")) {
						return "name cannot include spaces";
					}
					if (!input) {
						return "name is required";
					}
					return true;
				},
			},
			{
				type: "input",
				name: "description",
				message: "What is the description of this Durable Object?",
				default: "A new Durable Object implementation",
			},
			{
				type: "confirm",
				name: "usesSqlite",
				message: "Will this Durable Object use SQLite/Drizzle migrations?",
				default: false,
			},
			{
				type: "confirm",
				name: "wireWeb",
				message: "Should it be consumed from the web app?",
				default: true,
			},
			{
				type: "confirm",
				name: "usesWebSocket",
				message: "Will the web app forward WebSocket upgrades to this Durable Object?",
				default: false,
				when: (answers) => Boolean((answers as { wireWeb?: boolean }).wireWeb),
			},
		],
		actions: [
			{
				type: "addMany",
				destination: "durable-objects/{{ kebabCase name }}/",
				base: "templates/durable-object/",
				templateFiles: "**/*",
				stripExtensions: ["hbs"],
				globOptions: { dot: true },
				verbose: true,
			},
			(answers, _config, _plopfileApi) => {
				const data = answers as { name: string; description: string };
				const kebabName = plop.getHelper("kebabCase")(data.name);

				const srcPath = path.join("durable-objects", kebabName, ".gitignore.hbs");
				const destPath = path.join("durable-objects", kebabName, ".gitignore");

				try {
					if (fs.existsSync(srcPath)) {
						fs.renameSync(srcPath, destPath);
						return `Renamed .gitignore.hbs to .gitignore for ${kebabName}`;
					}
					return `No .gitignore.hbs file found to rename for ${kebabName}`;
				} catch (error) {
					if (error instanceof Error) {
						return `Failed to rename .gitignore.hbs: ${error.message}`;
					}
					return `Failed to rename .gitignore.hbs: ${error}`;
				}
			},
			() => {
				try {
					execSync("bun install", { stdio: "inherit" });
					return "Installed dependencies";
				} catch (error) {
					if (error instanceof Error) {
						return `Failed to install dependencies: ${error.message}`;
					}
					return `Failed to install dependencies: ${error}`;
				}
			},
			(answers) => {
				const data = answers as {
					name: string;
					usesSqlite?: boolean;
					wireWeb?: boolean;
					usesWebSocket?: boolean;
				};
				const kebabName = plop.getHelper("kebabCase")(data.name);
				const notes = [
					`Next steps for durable-objects/${kebabName}:`,
					`- Root package.json dev: add --filter=${kebabName} if it should run with bun run dev.`,
					`- Root turbo.json: add "${kebabName}#destroy:prod", "#destroy:staging", and "#destroy:preview" with dependsOn ["cf-starter-web#destroy:prod"] (etc.) if web binds to it.`,
				];
				if (data.usesSqlite) {
					notes.push(
						'- SQLite selected: add src/schema.ts, then run the package-local db:generate script. The generated drizzle.config.ts uses driver: "durable-sqlite". Do not hand-edit drizzle output.',
					);
				}
				if (data.wireWeb) {
					notes.push(
						`- apps/web/package.json: add "${kebabName}": "workspace:*" and run bun install.`,
						`- apps/web/alchemy.run.ts: import from "${kebabName}/alchemy" and bind the worker/namespace into ReactRouter.`,
					);
				}
				if (data.usesWebSocket) {
					notes.push(
						"- WebSocket selected: add an apps/web/workers/app.ts prefix handler before React Router, keep the client prefix identical, and forward to /websocket on the DO.",
					);
				}
				return notes.join("\n");
			},
		],
	});
}
