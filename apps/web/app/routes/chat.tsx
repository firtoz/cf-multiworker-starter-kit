import { env } from "cloudflare:workers";
import { fail, type MaybeError, success } from "@firtoz/maybe-error";
import type { RoutePath } from "@firtoz/router-toolkit";
import { type AuthUser, accountDisplayName, isAdminUser } from "@internal/auth-client";
import { GUEST_SESSION_RETENTION_DAYS } from "@internal/auth-db/constants";
import {
	createChatAttestToken,
	resolveChatAttestedIdentity,
	sanitizeChatRoomId,
} from "@internal/chat-contract";
import { registerChatRoom } from "@internal/db";
import { data } from "react-router";
import { ChatClient } from "~/components/chat/ChatClient";
import { ClientOnly } from "~/components/client/ClientOnly";
import { BackToHomeLink } from "~/components/shared/BackToHomeLink";
import { ensureChatSessionMiddleware, resolveRouteChatSession } from "~/lib/chat-session-context";
import { roomFromQueryParams } from "~/lib/chat-ws-url";
import { deleteChatRoomMessageForAdmin } from "~/lib/chatroom-admin";
import { routeAuthClientContext } from "~/lib/route-auth-client";
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
	canModerate: boolean;
};

export const middleware: Route.MiddlewareFunction[] = [ensureChatSessionMiddleware];

export async function loader({ request, context, url }: Route.LoaderArgs) {
	const ensured = await resolveRouteChatSession({ request, context });
	if (!ensured) {
		return fail("Could not start a chat session. Try refreshing the page.");
	}

	const { session, setCookieHeaders } = ensured;
	const pendingAuthCookies = setCookieHeaders.length > 0;
	const room = roomFromQueryParams(url.searchParams);
	await registerChatRoom(env.DB, room);
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
		canModerate: isAdminUser(session.user),
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
}: Route.ActionArgs): Promise<MaybeError<{ displayName: string } | true>> {
	const auth = context.get(routeAuthClientContext);
	const session = await auth.session.get();
	if (!session) {
		return fail("Not signed in");
	}

	const form = await request.formData();
	const intent = String(form.get("intent") ?? "");

	if (intent === "deleteMessage") {
		const adminSession = await auth.session.requireAdmin();
		if (!adminSession) {
			return fail("Forbidden");
		}
		const roomId = sanitizeChatRoomId(String(form.get("room") ?? ""));
		const messageId = String(form.get("messageId") ?? "").trim();
		if (!messageId) {
			return fail("Message id required");
		}
		const deleted = await deleteChatRoomMessageForAdmin(
			env,
			roomId,
			messageId,
			adminSession.user.id,
		);
		if (!deleted.success) {
			return fail(deleted.error.message);
		}
		await registerChatRoom(env.DB, roomId);
		return success(true);
	}

	if (intent !== "saveDisplayName") {
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
				canModerate={loaderData.result.canModerate}
				{...(saveNameError === undefined ? {} : { saveNameError })}
			/>
		</ClientOnly>
	);
}
