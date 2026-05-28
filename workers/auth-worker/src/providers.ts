import type { Hono } from "hono";
import type { CloudflareEnv } from "../env";
import type { createAuth } from "./auth";
import { authProviderFlags } from "./auth-provider-flags";

type AppVariables = {
	auth: ReturnType<typeof createAuth>;
	trustedOrigins: string[];
};

export function registerAuthProvidersRoute(
	app: Hono<{ Bindings: CloudflareEnv; Variables: AppVariables }>,
) {
	app.get("/api/auth/providers", (c) => {
		return c.json(authProviderFlags(c.env));
	});
	return app;
}
