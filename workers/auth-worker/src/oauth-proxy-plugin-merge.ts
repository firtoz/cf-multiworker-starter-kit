import type { BetterAuthPlugin } from "better-auth";

type AuthHook = NonNullable<NonNullable<BetterAuthPlugin["hooks"]>["before"]>[number];

export type OAuthProxyPluginHooks = {
	before: AuthHook[];
	after: AuthHook[];
};

/**
 * Compose stock Better Auth `oAuthProxy` with extension hooks without mutating the base plugin.
 * Callers build full `before` / `after` arrays (copy stock hooks, replace matchers, prepend extras).
 */
export function mergeOAuthProxyPlugin(
	base: BetterAuthPlugin,
	hooks: OAuthProxyPluginHooks,
): BetterAuthPlugin {
	return {
		...base,
		hooks: {
			before: hooks.before,
			after: hooks.after,
		},
	};
}

/** Clone a hook with an optional matcher override. */
export function withMatcher(hook: AuthHook, matcher: AuthHook["matcher"]): AuthHook {
	return { ...hook, matcher };
}
