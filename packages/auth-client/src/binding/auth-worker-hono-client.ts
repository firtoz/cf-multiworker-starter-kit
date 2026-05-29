import { honoFetcher, type TypedHonoFetcher } from "@firtoz/hono-fetcher";
import type { AccountApp } from "auth-worker/account";
import { accountPath } from "auth-worker/account";
import type { AdminApp } from "auth-worker/admin";
import { adminPath } from "auth-worker/admin";
import type { BetterAuthApp } from "auth-worker/better-auth";
import { betterAuthPath } from "auth-worker/better-auth";
import type { GuestUpgradeApp } from "auth-worker/guest-upgrade";
import { guestUpgradePath } from "auth-worker/guest-upgrade";
import type { AuthWorkerApp } from "auth-worker/hono-app";
import type { ProfileApp } from "auth-worker/profile";
import { profilePath } from "auth-worker/profile";
import type { Hono } from "hono";
import type { HonoClientApp } from "./hono-client-app";

export type HonoWireFetch = (url: string, init?: RequestInit) => ReturnType<Hono["request"]>;

function mountWireFetch(wireFetch: HonoWireFetch, mountPath: string): HonoWireFetch {
	return (url, init) => {
		const path = url === "/" || url === "" ? mountPath : `${mountPath}${url}`;
		return wireFetch(path, init);
	};
}

export type AuthWorkerHonoClient = {
	readonly root: TypedHonoFetcher<HonoClientApp<AuthWorkerApp>>;
	readonly admin: TypedHonoFetcher<HonoClientApp<AdminApp>>;
	readonly account: TypedHonoFetcher<HonoClientApp<AccountApp>>;
	readonly profile: TypedHonoFetcher<HonoClientApp<ProfileApp>>;
	readonly guestUpgrade: TypedHonoFetcher<HonoClientApp<GuestUpgradeApp>>;
	readonly betterAuth: TypedHonoFetcher<HonoClientApp<BetterAuthApp>>;
};

export function createAuthWorkerHonoClient(wireFetch: HonoWireFetch): AuthWorkerHonoClient {
	return {
		root: honoFetcher<HonoClientApp<AuthWorkerApp>>(wireFetch),
		admin: honoFetcher<HonoClientApp<AdminApp>>(mountWireFetch(wireFetch, adminPath)),
		account: honoFetcher<HonoClientApp<AccountApp>>(mountWireFetch(wireFetch, accountPath)),
		profile: honoFetcher<HonoClientApp<ProfileApp>>(mountWireFetch(wireFetch, profilePath)),
		guestUpgrade: honoFetcher<HonoClientApp<GuestUpgradeApp>>(
			mountWireFetch(wireFetch, guestUpgradePath),
		),
		betterAuth: honoFetcher<HonoClientApp<BetterAuthApp>>(
			mountWireFetch(wireFetch, betterAuthPath),
		),
	};
}

function createBrowserWireFetch(): HonoWireFetch {
	return (url, init) =>
		fetch(url, {
			...init,
			credentials: "include",
		} as RequestInit) as ReturnType<HonoWireFetch>;
}

export const browserAuthWorkerHono = createAuthWorkerHonoClient(createBrowserWireFetch());
