import { env } from "cloudflare:workers";
import { fail, type MaybeError, success } from "@firtoz/maybe-error";
import type { RoutePath } from "@firtoz/router-toolkit";
import {
	type AuthUser,
	createAuthClient,
	GUEST_SESSION_RETENTION_DAYS,
} from "@internal/auth-client";
import { data } from "react-router";
import { ChatClient } from "~/components/chat/ChatClient";
import { ClientOnly } from "~/components/client/ClientOnly";
import { BackToHomeLink } from "~/components/shared/BackToHomeLink";
import type { Route } from "./+types/chat";

export const route: RoutePath<"/chat"> = "/chat";

export function meta(_args: Route.MetaArgs) {
	return [
		{ title: "Chat" },
		{
			name: "description",
			content: "Group chat with persistent guest sessions or a signed-in account.",
		},
	];
}

export type ChatLoaderData = {
	user: AuthUser;
	sessionExpiresAt: string;
	guestRetentionDays: number;
};

export async function loader({ request }: Route.LoaderArgs) {
	const auth = createAuthClient(env.AUTH, request);
	const ensured = await auth.session.ensureChat();
	if (!ensured) {
		return fail("Could not start a chat session. Try refreshing the page.");
	}

	const { session, setCookieHeaders } = ensured;
	const payload = success({
		user: session.user,
		sessionExpiresAt: session.session.expiresAt,
		guestRetentionDays: GUEST_SESSION_RETENTION_DAYS,
	} satisfies ChatLoaderData);

	if (setCookieHeaders.length === 0) {
		return payload;
	}

	const headers = new Headers();
	for (const cookie of setCookieHeaders) {
		headers.append("Set-Cookie", cookie);
	}
	return data(payload, { headers });
}

export async function action({
	request,
}: Route.ActionArgs): Promise<MaybeError<{ displayName: string }>> {
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

	return success({ displayName });
}

export default function ChatRoute({ loaderData, actionData }: Route.ComponentProps) {
	if (!loaderData.success) {
		return (
			<div className="max-w-2xl mx-auto w-full px-4 py-4">
				<BackToHomeLink />
				<p className="text-red-600 mt-4">{loaderData.error}</p>
			</div>
		);
	}

	const saveNameError = actionData && !actionData.success ? actionData.error : undefined;

	return (
		<ClientOnly
			fallback={
				<div className="max-w-2xl mx-auto w-full h-dvh max-h-dvh min-h-0 flex flex-col overflow-hidden gap-3 px-4 py-4">
					<BackToHomeLink />
					<div className="flex min-h-0 flex-1 items-center justify-center text-gray-600 dark:text-gray-400 text-sm">
						Loading chat…
					</div>
				</div>
			}
		>
			<ChatClient
				user={loaderData.result.user}
				sessionExpiresAt={loaderData.result.sessionExpiresAt}
				guestRetentionDays={loaderData.result.guestRetentionDays}
				{...(saveNameError === undefined ? {} : { saveNameError })}
			/>
		</ClientOnly>
	);
}
