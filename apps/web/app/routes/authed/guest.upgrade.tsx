import { env } from "cloudflare:workers";
import { fail, success } from "@firtoz/maybe-error";
import type { RoutePath } from "@firtoz/router-toolkit";
import { accountDisplayName, getAuthProviders } from "@internal/auth-client";
import { data, href, redirect } from "react-router";
import { ClientOnly } from "~/components/client/ClientOnly";
import { GuestUpgradePanel } from "~/components/guest/GuestUpgradePanel";
import { BackToHomeLink } from "~/components/shared/BackToHomeLink";
import { accountLinkErrorFromUrl } from "~/lib/auth-link-error";
import { ensureChatSessionMiddleware, resolveRouteChatSession } from "~/lib/chat-session-context";
import { googleOAuthPortlessWarningForWebEnv } from "~/lib/google-oauth-portless-warning";
import { safeRedirectPath } from "~/lib/safe-redirect-path";
import type { Route } from "./+types/guest.upgrade";

export const route: RoutePath<"/guest/upgrade"> = "/guest/upgrade";

export function meta(_args: Route.MetaArgs) {
	return [
		{ title: "Create account" },
		{
			name: "description",
			content: "Upgrade your guest chat session to a permanent account without losing history.",
		},
	];
}

export const middleware: Route.MiddlewareFunction[] = [ensureChatSessionMiddleware];

export async function loader({ request, context, url }: Route.LoaderArgs) {
	const redirectTo = safeRedirectPath(url.searchParams.get("redirectTo"), href("/chat"));
	const ensured = await resolveRouteChatSession({ request, context });
	if (!ensured) {
		return fail("Could not start a guest session. Open chat first, then try again.");
	}

	const { session, setCookieHeaders } = ensured;

	if (session.user.isAnonymous !== true) {
		throw redirect(redirectTo);
	}

	const providers = await getAuthProviders(env.AUTH);
	const googlePortlessWarning =
		providers.google && !providers.googleLoopbackOAuthProxy && !providers.oauthProxy
			? googleOAuthPortlessWarningForWebEnv(env, true)
			: undefined;
	const linkErrorMessage = accountLinkErrorFromUrl(url);

	const payload = success({
		user: session.user,
		displayName: accountDisplayName(session.user) ?? "Guest",
		redirectTo,
		providers,
		...(googlePortlessWarning ? { googlePortlessWarning } : {}),
		...(linkErrorMessage ? { linkErrorMessage } : {}),
	});

	if (setCookieHeaders.length === 0) {
		return payload;
	}

	const headers = new Headers();
	for (const cookie of setCookieHeaders) {
		headers.append("Set-Cookie", cookie);
	}
	return data(payload, { headers });
}

export default function GuestUpgradeRoute({ loaderData }: Route.ComponentProps) {
	if (!loaderData.success) {
		return (
			<div className="container mx-auto px-4 py-8">
				<p className="text-red-600">{loaderData.error}</p>
			</div>
		);
	}

	return (
		<div className="container mx-auto px-4 py-8 sm:py-10">
			<BackToHomeLink />
			<ClientOnly fallback={<p className="text-sm text-gray-600 mt-8">Loading…</p>}>
				<div className="mt-8">
					<GuestUpgradePanel
						user={loaderData.result.user}
						redirectTo={loaderData.result.redirectTo}
						providers={loaderData.result.providers}
						{...(loaderData.result.googlePortlessWarning
							? { googlePortlessWarning: loaderData.result.googlePortlessWarning }
							: {})}
						{...(loaderData.result.linkErrorMessage
							? { linkErrorMessage: loaderData.result.linkErrorMessage }
							: {})}
					/>
				</div>
			</ClientOnly>
		</div>
	);
}
