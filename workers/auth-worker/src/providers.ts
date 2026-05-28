import type { Hono } from "hono";
import type { CloudflareEnv } from "../env";
import type { createAuth } from "./auth";

type AppVariables = {
	auth: ReturnType<typeof createAuth>;
	trustedOrigins: string[];
};

export function registerAuthProvidersRoute(
	app: Hono<{ Bindings: CloudflareEnv; Variables: AppVariables }>,
): void {
	app.get("/api/auth/providers", (c) => {
		const env = c.env;
		return c.json({
			google: Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim()),
			github: Boolean(env.GITHUB_CLIENT_ID?.trim() && env.GITHUB_CLIENT_SECRET?.trim()),
			email: true,
		});
	});
}
