import { env } from "cloudflare:workers";
import { fail, type MaybeError, success } from "@firtoz/maybe-error";
import type { RoutePath } from "@firtoz/router-toolkit";
import { type AuthUser, accountDisplayName, createAuthClient } from "@internal/auth-client";
import { href, redirect } from "react-router";
import { AccountDisplayNameForm } from "~/components/account/AccountDisplayNameForm";
import { BackToHomeLink } from "~/components/shared/BackToHomeLink";
import type { Route } from "./+types/account";

export const route: RoutePath<"/account"> = "/account";

export function meta(_args: Route.MetaArgs) {
	return [{ title: "Account" }, { name: "description", content: "Your account" }];
}

export async function loader({
	request,
}: Route.LoaderArgs): Promise<MaybeError<{ user: AuthUser }>> {
	const auth = createAuthClient(env.AUTH, request);
	const session = await auth.session.get();
	if (!session) {
		throw redirect(`${href("/login")}?redirectTo=${encodeURIComponent(href("/account"))}`);
	}
	if (session.user.isAnonymous === true) {
		throw redirect(href("/chat"));
	}
	return success({ user: session.user });
}

export async function action({
	request,
}: Route.ActionArgs): Promise<MaybeError<{ ok: true; user: AuthUser }>> {
	const auth = createAuthClient(env.AUTH, request);
	const session = await auth.session.get();
	if (!session) {
		return fail("Not signed in");
	}

	const form = await request.formData();
	if (form.get("intent") !== "saveDisplayName") {
		return fail("Unknown action");
	}

	const displayName = String(form.get("displayName") ?? "").trim();
	if (!displayName) {
		return fail("Display name is required");
	}

	const result = await auth.profile.update({ name: displayName });
	if (!result.success) {
		return fail(result.error);
	}

	return success({ ok: true, user: result.result.user });
}

export default function AccountRoute({ loaderData, actionData }: Route.ComponentProps) {
	const user =
		actionData?.success === true
			? actionData.result.user
			: loaderData.success
				? loaderData.result.user
				: null;

	if (!user) {
		return (
			<div className="container mx-auto px-4 py-8">
				<p className="text-red-600">{loaderData.success ? "Unexpected error" : loaderData.error}</p>
			</div>
		);
	}

	const displayName = accountDisplayName(user);

	return (
		<div className="container mx-auto px-4 py-8 max-w-lg">
			<BackToHomeLink />
			<h1 className="text-2xl font-bold mt-4 mb-4">Account</h1>
			<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
				<dt className="text-gray-500">Email</dt>
				<dd>{user.email}</dd>
				<dt className="text-gray-500">Display name</dt>
				<dd>{displayName ?? "—"}</dd>
				<dt className="text-gray-500">Role</dt>
				<dd>{user.role}</dd>
			</dl>
			<AccountDisplayNameForm initialName={displayName ?? ""} />
		</div>
	);
}
