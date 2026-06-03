import type { TypedHonoFetcher } from "@firtoz/hono-fetcher";
import type { MaybeError } from "@firtoz/maybe-error";
import {
	type AccountPageData,
	type AccountSessionsResponse,
	type AccountSummary,
	accountPageDataSchema,
	accountSessionsResponseSchema,
	accountSummarySchema,
	authAddContactEmailResponseSchema,
	authMutationOkResponseSchema,
} from "@internal/auth-db/api-schemas";
import type { AccountApp } from "auth-worker/account";
import type { HonoClientApp } from "../binding/hono-client-app";
import { parseBindingJson } from "./parse-json";

type AccountAppClient = HonoClientApp<AccountApp>;

export function createAccountApi(api: TypedHonoFetcher<AccountAppClient>) {
	return {
		getSummary(): Promise<MaybeError<AccountSummary>> {
			return parseBindingJson(
				api.get({ url: "/" }),
				"Could not load account",
				accountSummarySchema,
			);
		},
		loadPage(): Promise<MaybeError<AccountPageData>> {
			return parseBindingJson(
				api.get({ url: "/", query: { includeSessions: "1" } }),
				"Could not load account",
				accountPageDataSchema,
			);
		},
		setNotificationEmail(emailId: string): Promise<MaybeError<{ ok: true }>> {
			return parseBindingJson(
				api.patch({
					url: "/",
					body: { intent: "setNotificationEmail", emailId },
				}),
				"Could not update notification email",
				authMutationOkResponseSchema,
			);
		},
		addContactEmail(email: string): Promise<MaybeError<{ ok: true; emailId: string }>> {
			return parseBindingJson(
				api.patch({
					url: "/",
					body: { intent: "addContactEmail", email },
				}),
				"Could not add email",
				authAddContactEmailResponseSchema,
			);
		},
		setSignInEmail(emailId: string): Promise<MaybeError<{ ok: true }>> {
			return parseBindingJson(
				api.patch({
					url: "/",
					body: { intent: "setSignInEmail", emailId },
				}),
				"Could not update sign-in email",
				authMutationOkResponseSchema,
			);
		},
		setPassword(newPassword: string): Promise<MaybeError<{ ok: true }>> {
			return parseBindingJson(
				api.post({
					url: "/password",
					body: { intent: "setPassword", newPassword },
				}),
				"Could not set password",
				authMutationOkResponseSchema,
			);
		},
		changePassword(
			currentPassword: string,
			newPassword: string,
			options?: { revokeOtherSessions?: boolean },
		): Promise<MaybeError<{ ok: true }>> {
			return parseBindingJson(
				api.post({
					url: "/password",
					body: {
						intent: "changePassword",
						currentPassword,
						newPassword,
						...(options?.revokeOtherSessions ? { revokeOtherSessions: true } : {}),
					},
				}),
				"Could not change password",
				authMutationOkResponseSchema,
			);
		},
		listSessions(): Promise<MaybeError<AccountSessionsResponse>> {
			return parseBindingJson(
				api.get({ url: "/sessions" }),
				"Could not load sessions",
				accountSessionsResponseSchema,
			);
		},
		revokeSession(sessionId: string): Promise<MaybeError<{ ok: true }>> {
			return parseBindingJson(
				api.delete({ url: "/sessions/:id", params: { id: sessionId } }),
				"Could not sign out that session",
				authMutationOkResponseSchema,
			);
		},
		revokeOtherSessions(): Promise<MaybeError<{ ok: true }>> {
			return parseBindingJson(
				api.post({ url: "/sessions/revoke-others" }),
				"Could not sign out other sessions",
				authMutationOkResponseSchema,
			);
		},
	};
}
