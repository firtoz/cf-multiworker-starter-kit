import { Hono } from "hono";
import { cors } from "hono/cors";
import type { CloudflareEnv } from "../env";
import { registerAccountRoutes } from "./account";
import { registerAdminRoutes } from "./admin";
import { createAuth } from "./auth";
import { registerGuestUpgradeRoutes } from "./guest-upgrade";
import { ensureTrustedOriginsSeeded } from "./origins";
import { registerProfileRoutes } from "./profile";
import { registerAuthProvidersRoute } from "./providers";

type AppVariables = {
	auth: ReturnType<typeof createAuth>;
	trustedOrigins: string[];
};

export const authWorkerApp = registerAuthProvidersRoute(
	registerGuestUpgradeRoutes(
		registerAccountRoutes(
			registerProfileRoutes(
				registerAdminRoutes(
					new Hono<{ Bindings: CloudflareEnv; Variables: AppVariables }>()
						.use("*", async (c, next) => {
							const seeds = c.env.AUTH_SEED_ORIGINS
								? c.env.AUTH_SEED_ORIGINS.split(",").map((s) => s.trim())
								: [];
							const trustedOrigins = await ensureTrustedOriginsSeeded(c.env.AUTH_KV, seeds);
							const auth = createAuth(c.env, trustedOrigins);
							c.set("trustedOrigins", trustedOrigins);
							c.set("auth", auth);
							await next();
						})
						.use("*", async (c, next) => {
							const trustedOrigins = c.var.trustedOrigins;
							return cors({
								origin: (origin) => {
									if (!origin) {
										return null;
									}
									return trustedOrigins.includes(origin) ? origin : null;
								},
								allowHeaders: ["Content-Type", "Authorization", "Cookie"],
								allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
								credentials: true,
							})(c, next);
						})
						.get("/health", (c) => c.json({ ok: true })),
				),
			),
		),
	),
).on(["GET", "POST"], "/api/auth/*", async (c) => c.var.auth.handler(c.req.raw));

export type AuthWorkerApp = typeof authWorkerApp;
