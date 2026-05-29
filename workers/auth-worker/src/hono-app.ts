import { Hono } from "hono";
import { cors } from "hono/cors";
import { account, accountPath } from "./account";
import { admin, adminPath } from "./admin";
import type { AuthWorkerAppEnv } from "./app-env";
import { createAuth } from "./auth";
import { betterAuth, betterAuthPath } from "./better-auth-routes";
import { guestUpgrade, guestUpgradePath } from "./guest-upgrade";
import { ensureTrustedOriginsSeeded } from "./origins";
import { profile, profilePath } from "./profile";

export const authWorkerApp = new Hono<AuthWorkerAppEnv>()
	.use("*", async (c, next) => {
		const seeds = c.env.AUTH_SEED_ORIGINS
			? c.env.AUTH_SEED_ORIGINS.split(",").map((s) => s.trim())
			: [];
		const trustedOrigins = await ensureTrustedOriginsSeeded(c.env.AUTH_KV, seeds);
		c.set("trustedOrigins", trustedOrigins);
		c.set("auth", createAuth(c.env, trustedOrigins));
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
	.get("/health", (c) => c.json({ ok: true }))
	.route(adminPath, admin)
	.route(accountPath, account)
	.route(profilePath, profile)
	.route(guestUpgradePath, guestUpgrade)
	.route(betterAuthPath, betterAuth);

export type AuthWorkerApp = typeof authWorkerApp;
