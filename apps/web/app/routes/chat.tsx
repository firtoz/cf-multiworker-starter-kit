import { env } from "cloudflare:workers";
import { fail, type MaybeError, success } from "@firtoz/maybe-error";
import type { RoutePath } from "@firtoz/router-toolkit";
import {
	type AuthUser,
	accountDisplayName,
	GUEST_SESSION_RETENTION_DAYS,
} from "@internal/auth-client";
import { createChatAttestToken, resolveChatAttestedIdentity } from "@internal/chat-contract";
import { data } from "react-router";
import { ChatClient } from "~/components/chat/ChatClient";
import { ClientOnly } from "~/components/client/ClientOnly";
import { BackToHomeLink } from "~/components/shared/BackToHomeLink";
import { roomFromQueryParams } from "~/lib/chat-ws-url";
import { createRouteAuthClient } from "~/lib/route-auth-client";
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
	/** True when the loader just issued `Set-Cookie` — client must wait before opening the chat WebSocket. */
	pendingAuthCookies: boolean;
	/** Room-scoped WS attest token — avoids AUTH `getSession` on WebSocket upgrade. */
	chatAttestToken: string;
	chatAttestRoom: string;
};

export async function loader({ request, context }: Route.LoaderArgs) {
	const auth = createRouteAuthClient(request, context);
	const ensured = await auth.session.ensureChat();
	if (!ensured) {
		return fail("Could not start a chat session. Try refreshing the page.");
	}

	const { session, setCookieHeaders } = ensured;
	const pendingAuthCookies = setCookieHeaders.length > 0;
	const room = roomFromQueryParams(new URL(request.url).searchParams);
	const identity = resolveChatAttestedIdentity({
		userId: session.user.id,
		profileDisplayName: accountDisplayName(session.user),
		isAnonymous: session.user.isAnonymous === true,
	});
	const chatAttestToken = await createChatAttestToken(identity, room, env.CHATROOM_INTERNAL_SECRET);
	const payload = success({
		user: session.user,
		sessionExpiresAt: session.session.expiresAt,
		guestRetentionDays: GUEST_SESSION_RETENTION_DAYS,
		pendingAuthCookies,
		chatAttestToken,
		chatAttestRoom: room,
	} satisfies ChatLoaderData);

	if (!pendingAuthCookies) {
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
	context,
}: Route.ActionArgs): Promise<MaybeError<{ displayName: string }>> {
	const auth = createRouteAuthClient(request, context);
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
				<div className="max-w-2xl mx-auto w-full min-h-full flex flex-col justify-center gap-2 px-4 py-3">
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
				pendingAuthCookies={loaderData.result.pendingAuthCookies}
				chatAttestToken={loaderData.result.chatAttestToken}
				chatAttestRoom={loaderData.result.chatAttestRoom}
				{...(saveNameError === undefined ? {} : { saveNameError })}
			/>
		</ClientOnly>
	);
}
