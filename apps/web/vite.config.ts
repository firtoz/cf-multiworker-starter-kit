import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import alchemy from "alchemy/cloudflare/react-router";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig, type PluginOption, type UserConfig } from "vite";
import { imagetools } from "vite-imagetools";
import devtoolsJson from "vite-plugin-devtools-json";

export default defineConfig((configEnv) => {
	const { mode } = configEnv;

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
			alchemy() as PluginOption,
			reactRouter(),
			tailwindcss(),
			imagetools({
				include: "**/*.{heif,avif,jpeg,jpg,png,tiff,webp,gif,svg}?*",
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
