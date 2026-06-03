import { env } from "cloudflare:workers";
import { fail, type MaybeError, success } from "@firtoz/maybe-error";
import { formAction, type RoutePath } from "@firtoz/router-toolkit";
import { accountDisplayName } from "@internal/auth-client/display-name";
import type { AuthUser } from "@internal/auth-client/roles";
import {
	type AccountSessionRow,
	type AccountSummary,
	accountFormSchema,
	type ProfileUserWire,
} from "@internal/auth-db/api-schemas";
import { parseAuthRole } from "@internal/auth-db/roles";
import { href } from "react-router";
import { AccountDisplayNameForm } from "~/components/account/AccountDisplayNameForm";
import { AccountEmailsSection } from "~/components/account/AccountEmailsSection";
import { AccountPasswordForm } from "~/components/account/AccountPasswordForm";
import { AccountSessionsSection } from "~/components/account/AccountSessionsSection";
import { AccountSignInMethods } from "~/components/account/AccountSignInMethods";
import { BackToHomeLink } from "~/components/shared/BackToHomeLink";
import { requireSignedInMiddleware } from "~/lib/admin-auth-middleware.server";
import { accountLinkErrorFromUrl } from "~/lib/auth-link-error";
import { googleOAuthPortlessWarningForWebEnv } from "~/lib/google-oauth-portless-warning.server";
import { routeAuthClientContext } from "~/lib/route-auth-client.server";
import { signedInAuthSessionContext } from "~/lib/route-context.server";
import type { Route } from "./+types/account";

export const route: RoutePath<"/account"> = "/account";

export const formSchema = accountFormSchema;

export type AccountActionSuccess = {
	ok: true;
	user?: AuthUser;
	summary?: AccountSummary;
	sessions?: AccountSessionRow[];
};

function summaryUserToAuthUser(user: ProfileUserWire): AuthUser {
	return {
		id: user.id,
		email: user.email,
		role: parseAuthRole(user.role),
		...(user.name?.trim() ? { name: user.name.trim() } : {}),
		...(user.image?.trim() ? { image: user.image.trim() } : {}),
		...(user.isAnonymous === true ? { isAnonymous: true } : {}),
	};
}

export function meta(_args: Route.MetaArgs) {
	return [{ title: "Account" }, { name: "description", content: "Your account" }];
}

export const middleware: Route.MiddlewareFunction[] = [requireSignedInMiddleware];

export async function loader({ context, url }: Route.LoaderArgs) {
	const auth = context.get(routeAuthClientContext);
	const accountPath = href("/account");
	const session = context.get(signedInAuthSessionContext);

	const summaryResult = await auth.account.loadPage();
	if (!summaryResult.success) {
		return fail(summaryResult.error);
	}
	const { sessions, ...summary } = summaryResult.result;
	const googlePortlessWarning =
		summary.providers.google &&
		!summary.providers.googleLoopbackOAuthProxy &&
		!summary.providers.oauthProxy
			? googleOAuthPortlessWarningForWebEnv(env, true)
			: undefined;
	const linkErrorMessage = accountLinkErrorFromUrl(url);
	return success({
		summary,
		sessions,
		currentSessionId: sessions.find((s) => s.isCurrent)?.id ?? session.session.id,
		accountPath,
		...(googlePortlessWarning ? { googlePortlessWarning } : {}),
		...(linkErrorMessage ? { linkErrorMessage } : {}),
	});
}

export const action = formAction({
	schema: accountFormSchema,
	handler: async ({ context }, body): Promise<MaybeError<AccountActionSuccess>> => {
		const auth = context.get(routeAuthClientContext);

		switch (body.intent) {
			case "saveDisplayName": {
				const result = await auth.profile.update({ name: body.displayName });
				if (!result.success) {
					return fail(result.error);
				}
				const summaryResult = await auth.account.getSummary();
				if (!summaryResult.success) {
					return success({ ok: true as const, user: result.result.user });
				}
				return success({
					ok: true as const,
					user: result.result.user,
					summary: summaryResult.result,
				});
			}
			case "setNotificationEmail": {
				const result = await auth.account.setNotificationEmail(body.emailId);
				if (!result.success) {
					return fail(result.error);
				}
				const summaryResult = await auth.account.getSummary();
				if (!summaryResult.success) {
					return fail(summaryResult.error);
				}
				return success({ ok: true as const, summary: summaryResult.result });
			}
			case "addContactEmail": {
				const result = await auth.account.addContactEmail(body.email);
				if (!result.success) {
					return fail(result.error);
				}
				const summaryResult = await auth.account.getSummary();
				if (!summaryResult.success) {
					return fail(summaryResult.error);
				}
				return success({ ok: true as const, summary: summaryResult.result });
			}
			case "setSignInEmail": {
				const result = await auth.account.setSignInEmail(body.emailId);
				if (!result.success) {
					return fail(result.error);
				}
				const summaryResult = await auth.account.getSummary();
				if (!summaryResult.success) {
					return fail(summaryResult.error);
				}
				return success({ ok: true as const, summary: summaryResult.result });
			}
			case "setPassword": {
				const result = await auth.account.setPassword(body.newPassword);
				if (!result.success) {
					return fail(result.error);
				}
				const summaryResult = await auth.account.getSummary();
				if (!summaryResult.success) {
					return fail(summaryResult.error);
				}
				return success({ ok: true as const, summary: summaryResult.result });
			}
			case "changePassword": {
				const result = await auth.account.changePassword(body.currentPassword, body.newPassword, {
					revokeOtherSessions: body.revokeOtherSessions === true,
				});
				if (!result.success) {
					return fail(result.error);
				}
				const pageResult = await auth.account.loadPage();
				if (!pageResult.success) {
					return fail(pageResult.error);
				}
				const { sessions, ...summary } = pageResult.result;
				return success({
					ok: true as const,
					summary,
					sessions,
				});
			}
			case "revokeSession": {
				const result = await auth.account.revokeSession(body.sessionId);
				if (!result.success) {
					return fail(result.error);
				}
				const sessionsResult = await auth.account.listSessions();
				if (!sessionsResult.success) {
					return fail(sessionsResult.error);
				}
				return success({ ok: true as const, sessions: sessionsResult.result.sessions });
			}
			case "revokeOtherSessions": {
				const result = await auth.account.revokeOtherSessions();
				if (!result.success) {
					return fail(result.error);
				}
				const sessionsResult = await auth.account.listSessions();
				if (!sessionsResult.success) {
					return fail(sessionsResult.error);
				}
				return success({ ok: true as const, sessions: sessionsResult.result.sessions });
			}
		}
	},
});

export default function AccountRoute({ loaderData }: Route.ComponentProps) {
	if (!loaderData.success) {
		return (
			<div className="container mx-auto px-4 py-8">
				<p className="text-red-600">{loaderData.error}</p>
			</div>
		);
	}

	const {
		summary,
		sessions,
		currentSessionId,
		accountPath,
		googlePortlessWarning,
		linkErrorMessage,
	} = loaderData.result;

	const displayName = accountDisplayName(summaryUserToAuthUser(summary.user));
	return (
		<div className="container mx-auto px-4 py-8 max-w-lg">
			<BackToHomeLink />
			<h1 className="text-2xl font-bold mt-4 mb-4">Account</h1>
			<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
				<dt className="text-gray-500">Sign-in email</dt>
				<dd>{summary.emails.find((e) => e.isSignInEmail)?.email ?? summary.user.email}</dd>
				<dt className="text-gray-500">Display name</dt>
				<dd>{displayName ?? "—"}</dd>
				<dt className="text-gray-500">Role</dt>
				<dd>{summary.user.role}</dd>
			</dl>
			<AccountDisplayNameForm initialName={displayName ?? ""} />
			<AccountSignInMethods
				summary={summary}
				accountPath={accountPath}
				{...(googlePortlessWarning ? { googlePortlessWarning } : {})}
				{...(linkErrorMessage ? { linkErrorMessage } : {})}
			/>
			<AccountEmailsSection summary={summary} />
			<AccountPasswordForm hasPassword={summary.hasPassword} />
			<AccountSessionsSection sessions={sessions} currentSessionId={currentSessionId} />
		</div>
	);
}
