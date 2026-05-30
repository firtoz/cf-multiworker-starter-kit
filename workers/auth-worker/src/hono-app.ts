import { Hono } from "hono";
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
	.get("/health", (c) => c.json({ ok: true }))
	.route(adminPath, admin)
	.route(accountPath, account)
	.route(profilePath, profile)
	.route(guestUpgradePath, guestUpgrade)
	.route(betterAuthPath, betterAuth);

export type AuthWorkerApp = typeof authWorkerApp;
