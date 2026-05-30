import { env } from "cloudflare:workers";
import { type MaybeError, success } from "@firtoz/maybe-error";
import type { RoutePath } from "@firtoz/router-toolkit";
import { type AuthProviders, getAuthProviders, resolveAuthSession } from "@internal/auth-client";
import { href, redirect } from "react-router";
import { LoginPanel } from "~/components/auth/LoginPanel";
import { ClientOnly } from "~/components/client/ClientOnly";
import { BackToHomeLink } from "~/components/shared/BackToHomeLink";
import { accountLinkErrorFromRequestUrl } from "~/lib/auth-link-error";
import { googleOAuthPortlessWarningForWebEnv } from "~/lib/google-oauth-portless-warning";
import { safeRedirectPath } from "~/lib/safe-redirect-path";
import type { Route } from "./+types/login";

export const route: RoutePath<"/login"> = "/login";

export function meta(_args: Route.MetaArgs) {
	return [{ title: "Sign in" }, { name: "description", content: "Sign in to the app" }];
}

export async function loader({ request, context }: Route.LoaderArgs): Promise<
	MaybeError<{
		redirectTo: string;
		providers: AuthProviders;
		googlePortlessWarning?: string;
		oauthErrorMessage?: string;
	}>
> {
	const session = await resolveAuthSession(context, env.AUTH, request);
	const url = new URL(request.url);
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
	const oauthErrorMessage = accountLinkErrorFromRequestUrl(request.url);
	return success({
		redirectTo,
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
			<ClientOnly fallback={<p className="text-sm text-gray-600 mt-6">Loading sign-in…</p>}>
				<LoginPanel
					redirectTo={loaderData.result.redirectTo}
					providers={loaderData.result.providers}
					{...(loaderData.result.googlePortlessWarning
						? { googlePortlessWarning: loaderData.result.googlePortlessWarning }
						: {})}
					{...(loaderData.result.oauthErrorMessage
						? { oauthErrorMessage: loaderData.result.oauthErrorMessage }
						: {})}
				/>
			</ClientOnly>
		</div>
	);
}
