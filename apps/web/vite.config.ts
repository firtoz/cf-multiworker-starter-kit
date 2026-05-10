import { existsSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { styleText } from "node:util";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import alchemy from "alchemy/cloudflare/react-router";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig, type Plugin, type PluginOption, type UserConfig } from "vite";
import { imagetools } from "vite-imagetools";
import devtoolsJson from "vite-plugin-devtools-json";

/**
 * Do **not** import **`alchemy-utils`** (workspace `*.ts`) here — **`react-router typegen`** loads this file with **Node**
 * in CI, which cannot resolve TypeScript source from sibling packages (**`ERR_UNKNOWN_FILE_EXTENSION`**).
 * `alchemy-cli` / deploy always sets **`STAGE`**; unset ⇒ treat like **`local`** (no PostHog hidden maps).
 */
function isNonLocalStageForPosthogSourcemaps(): boolean {
	const s = process.env["STAGE"]?.trim().toLowerCase();
	return s !== undefined && s !== "" && s !== "local";
}

/** Set when Vite runs inside Portless (see `alchemy.run.ts` `portless run` `dev`). */
function portlessPublicOrigin(): string | undefined {
	const raw = process.env["PORTLESS_URL"]?.trim();
	if (!raw) {
		return undefined;
	}
	return raw.replace(/\/$/, "");
}

function portlessDevUrlPlugin(publicOrigin: string): Plugin {
	return {
		name: "multiworker-portless-dev-urls",
		apply: "serve",
		enforce: "post",
		configureServer(server) {
			const origPrint = server.printUrls.bind(server);
			server.printUrls = () => {
				const urls = server.resolvedUrls;
				if (!urls) {
					origPrint();
					return;
				}
				const info = server.config.logger.info.bind(server.config.logger);
				const arrow = styleText(["green"], "➜");
				const localLabel = styleText(["bold"], "Local");
				const networkLabel = styleText(["bold"], "Network");
				const directLabel = styleText(["bold", "dim"], "Vite (direct)");
				const colorUrl = (u: string) => styleText(["cyan"], u);
				const publicUrl = `${publicOrigin}/`;
				info(`  ${arrow}  ${localLabel}:   ${colorUrl(publicUrl)}`);
				const viteLocal = urls.local[0];
				if (viteLocal) {
					try {
						if (new URL(viteLocal).origin !== publicOrigin) {
							info(`  ${arrow}  ${directLabel}: ${styleText(["dim"], viteLocal)}`);
						}
					} catch {
						// ignore malformed resolved URL
					}
				}
				for (const u of urls.network) {
					info(`  ${arrow}  ${networkLabel}: ${colorUrl(u)}`);
				}
				const hostDisabled =
					server.config.server.host === undefined || server.config.server.host === false;
				if (urls.network.length === 0 && hostDisabled) {
					info(
						`${styleText(["dim"], `  ${arrow}  ${networkLabel}: use `)}${styleText(["bold"], "--host")}${styleText(["dim"], " to expose")}`,
					);
				}
			};
		},
	};
}

export default defineConfig((configEnv) => {
	const { command, mode } = configEnv;
	const hasAlchemyConfig = existsSync(
		fileURLToPath(new URL(".alchemy/local/wrangler.jsonc", import.meta.url)),
	);
	const useAlchemyPlugin = command === "serve" || hasAlchemyConfig;
	const portlessOrigin = command === "serve" ? portlessPublicOrigin() : undefined;
	const posthogCliForSourcemaps =
		Boolean(
			process.env["POSTHOG_CLI_TOKEN"]?.trim() || process.env["POSTHOG_CLI_API_KEY"]?.trim(),
		) &&
		Boolean(
			process.env["POSTHOG_CLI_ENV_ID"]?.trim() || process.env["POSTHOG_CLI_PROJECT_ID"]?.trim(),
		);
	/** `hidden` for deployed stages only — never emit maps for **`local`** dev. PostHog [Vite doc](https://posthog.com/docs/error-tracking/upload-source-maps/react) uses `sourcemap: true`. */
	const posthogSourceMaps = posthogCliForSourcemaps && isNonLocalStageForPosthogSourcemaps();

	return {
		define: {
			"process.env.NODE_ENV": JSON.stringify(mode),
		},
		server: {
			host: true,
			strictPort: true,
			...(portlessOrigin ? { origin: portlessOrigin } : {}),
		},
		plugins: [
			portlessOrigin ? portlessDevUrlPlugin(portlessOrigin) : null,
			devtoolsJson(),
			// @see https://alchemy.run/guides/cloudflare-react-router/ (template uses vite-tsconfig-paths; Vite 8+ uses resolve.tsconfigPaths below)
			useAlchemyPlugin ? (alchemy() as PluginOption) : null,
			reactRouter(),
			tailwindcss(),
			imagetools({
				// Omit `svg`: Sharp rasterizes SVGs; SSR and client could disagree on `.png` vs `.svg`
				// URLs for the same `?url` import. Use `*.svg?url` (plain Vite asset) for icons instead.
				include: "**/*.{heif,avif,jpeg,jpg,png,tiff,webp,gif}?*",
				exclude: [],
			}),
			visualizer({
				filename: "build/stats.html",
				open: false,
				gzipSize: true,
				brotliSize: true,
			}),
		],
		build: {
			cssCodeSplit: true,
			minify: "esbuild",
			rollupOptions: useAlchemyPlugin
				? undefined
				: {
						external: ["cloudflare:workers"],
					},
			target: "esnext",
			sourcemap: posthogSourceMaps ? "hidden" : false,
		},
		optimizeDeps: {
			include: ["react", "react-dom", "react-router"],
			exclude: [],
		},
		resolve: {
			tsconfigPaths: true,
		},
	} as UserConfig;
});
