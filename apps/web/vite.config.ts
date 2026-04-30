import { existsSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import alchemy from "alchemy/cloudflare/react-router";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig, type PluginOption, type UserConfig } from "vite";
import { imagetools } from "vite-imagetools";
import devtoolsJson from "vite-plugin-devtools-json";

export default defineConfig((configEnv) => {
	const { command, mode } = configEnv;
	const hasAlchemyConfig = existsSync(
		fileURLToPath(new URL(".alchemy/local/wrangler.jsonc", import.meta.url)),
	);
	const useAlchemyPlugin = command === "serve" || hasAlchemyConfig;

	return {
		define: {
			"process.env.NODE_ENV": JSON.stringify(mode),
		},
		server: {
			host: true,
		},
		plugins: [
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
			sourcemap: false,
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
