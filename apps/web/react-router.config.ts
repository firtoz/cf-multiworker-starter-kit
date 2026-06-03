import type { Config } from "@react-router/dev/config";

export default {
	ssr: true,
	future: {
		/** Vite 7 environment API — required for Alchemy Cloudflare React Router plugin. */
		v8_viteEnvironmentApi: true,
		/** Split client route exports into independent chunks (v8 default). */
		v8_splitRouteModules: true,
		/** Raw `request` in loaders/actions; use the `url` arg for normalized routing. */
		v8_passThroughRequests: true,
		/** Trailing-slash-aware `.data` URLs (`/path/_.data` vs `/path.data`). */
		v8_trailingSlashAwareDataRequests: true,
		/** Route middleware + `RouterContextProvider` / `createContext` (v8 default). */
		v8_middleware: true,
	},
} satisfies Config;
