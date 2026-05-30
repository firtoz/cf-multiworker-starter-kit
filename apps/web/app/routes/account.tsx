import { env } from "cloudflare:workers";
import { fail, type MaybeError, success } from "@firtoz/maybe-error";
import { formAction, type RoutePath } from "@firtoz/router-toolkit";
import {
	type AccountSummary,
	type AuthUser,
	accountDisplayName,
	createAuthClient,
	type ProfileUserWire,
} from "@internal/auth-client";
import { accountFormSchema } from "@internal/auth-db/api-schemas";
import { parseAuthRole } from "@internal/auth-db/roles";
import { href, redirect } from "react-router";
import { AccountDisplayNameForm } from "~/components/account/AccountDisplayNameForm";
import { AccountEmailsSection } from "~/components/account/AccountEmailsSection";
import { AccountPasswordForm } from "~/components/account/AccountPasswordForm";
import { AccountSignInMethods } from "~/components/account/AccountSignInMethods";
import { BackToHomeLink } from "~/components/shared/BackToHomeLink";
import { accountLinkErrorFromRequestUrl } from "~/lib/auth-link-error";
import { googleOAuthPortlessWarningForWebEnv } from "~/lib/google-oauth-portless-warning";
import type { Route } from "./+types/account";

export const route: RoutePath<"/account"> = "/account";

export const formSchema = accountFormSchema;

export type AccountActionSuccess = {
	ok: true;
	user?: AuthUser;
	summary?: AccountSummary;
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

export async function loader({ request }: Route.LoaderArgs) {
	const auth = createAuthClient(env.AUTH, request);
	const accountPath = href("/account");
	const session = await auth.session.get();
	if (!session) {
		throw redirect(`${href("/login")}?redirectTo=${encodeURIComponent(href("/account"))}`);
	}
	if (session.user.isAnonymous === true) {
		throw redirect(`${href("/guest/upgrade")}?redirectTo=${encodeURIComponent(href("/account"))}`);
	}

	const summaryResult = await auth.account.getSummary();
	if (!summaryResult.success) {
		return fail(summaryResult.error);
	}

	const googlePortlessWarning =
		summaryResult.result.providers.google &&
		!summaryResult.result.providers.googleLoopbackOAuthProxy &&
		!summaryResult.result.providers.oauthProxy
			? googleOAuthPortlessWarningForWebEnv(env, true)
			: undefined;
	const linkErrorMessage = accountLinkErrorFromRequestUrl(request.url);
	return success({
		summary: summaryResult.result,
		accountPath,
		...(googlePortlessWarning ? { googlePortlessWarning } : {}),
		...(linkErrorMessage ? { linkErrorMessage } : {}),
	});
}

export const action = formAction({
	schema: accountFormSchema,
	handler: async ({ request }, body): Promise<MaybeError<AccountActionSuccess>> => {
		const auth = createAuthClient(env.AUTH, request);
		const session = await auth.session.get();
		if (!session) {
			return fail("Not signed in");
		}

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
				const result = await auth.account.changePassword(body.currentPassword, body.newPassword);
				if (!result.success) {
					return fail(result.error);
				}
				const summaryResult = await auth.account.getSummary();
				if (!summaryResult.success) {
					return fail(summaryResult.error);
				}
				return success({ ok: true as const, summary: summaryResult.result });
			}
		}
	},
});

export default function AccountRoute({ loaderData }: Route.ComponentProps) {
	const summary = loaderData.success ? loaderData.result.summary : null;
	const accountPath = loaderData.success ? loaderData.result.accountPath : href("/account");
	const googlePortlessWarning = loaderData.success
		? loaderData.result.googlePortlessWarning
		: undefined;
	const linkErrorMessage = loaderData.success ? loaderData.result.linkErrorMessage : undefined;

	if (!summary) {
		return (
			<div className="container mx-auto px-4 py-8">
				<p className="text-red-600">{loaderData.success ? "Unexpected error" : loaderData.error}</p>
			</div>
		);
	}

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
		</div>
	);
}
