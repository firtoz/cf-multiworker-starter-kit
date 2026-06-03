import { env } from "cloudflare:workers";
import { type MaybeError, success } from "@firtoz/maybe-error";
import type { RoutePath } from "@firtoz/router-toolkit";
import { type AuthProviders, getAuthProviders } from "@internal/auth-client/session";
import { href, redirect } from "react-router";
import { LoginPanel } from "~/components/auth/LoginPanel";
import { BackToHomeLink } from "~/components/shared/BackToHomeLink";
import { accountLinkErrorFromUrl } from "~/lib/auth-link-error";
import { googleOAuthPortlessWarningForWebEnv } from "~/lib/google-oauth-portless-warning.server";
import { resolveAuthSession } from "~/lib/route-context.server";
import { safeRedirectPath } from "~/lib/safe-redirect-path";
import type { Route } from "./+types/login";

export const route: RoutePath<"/login"> = "/login";

export function meta(_args: Route.MetaArgs) {
	return [{ title: "Sign in" }, { name: "description", content: "Sign in to the app" }];
}

export async function loader({ context, url }: Route.LoaderArgs): Promise<
	MaybeError<{
		redirectTo: string;
		origin: string;
		providers: AuthProviders;
		googlePortlessWarning?: string;
		oauthErrorMessage?: string;
	}>
> {
	const session = await resolveAuthSession(context);
	const redirectTo = safeRedirectPath(url.searchParams.get("redirectTo"), href("/"));
	if (session && session.user.isAnonymous === true) {
		const upgradeUrl = `${href("/guest/upgrade")}?redirectTo=${encodeURIComponent(redirectTo)}`;
		throw redirect(upgradeUrl);
	}
	if (session && session.user.isAnonymous !== true) {
		throw redirect(redirectTo);
	}
	const providers = await getAuthProviders(env.AUTH);
	const googlePortlessWarning =
		providers.google && !providers.googleLoopbackOAuthProxy && !providers.oauthProxy
			? googleOAuthPortlessWarningForWebEnv(env, true)
			: undefined;
	const oauthErrorMessage = accountLinkErrorFromUrl(url);
	return success({
		redirectTo,
		origin: url.origin,
		providers,
		...(googlePortlessWarning ? { googlePortlessWarning } : {}),
		...(oauthErrorMessage ? { oauthErrorMessage } : {}),
	});
}

export default function LoginRoute({ loaderData }: Route.ComponentProps) {
	if (!loaderData.success) {
		return (
			<div className="container mx-auto px-4 py-8">
				<p className="text-red-600">{loaderData.error}</p>
			</div>
		);
	}

	return (
		<div className="container mx-auto px-4 py-8">
			<BackToHomeLink />
			<LoginPanel
				redirectTo={loaderData.result.redirectTo}
				origin={loaderData.result.origin}
				providers={loaderData.result.providers}
				{...(loaderData.result.googlePortlessWarning
					? { googlePortlessWarning: loaderData.result.googlePortlessWarning }
					: {})}
				{...(loaderData.result.oauthErrorMessage
					? { oauthErrorMessage: loaderData.result.oauthErrorMessage }
					: {})}
			/>
		</div>
	);
}
