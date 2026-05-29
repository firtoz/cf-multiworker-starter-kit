import type { TypedHonoFetcher } from "@firtoz/hono-fetcher";
import type { MaybeError } from "@firtoz/maybe-error";
import {
	type AccountSummary,
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
		): Promise<MaybeError<{ ok: true }>> {
			return parseBindingJson(
				api.post({
					url: "/password",
					body: { intent: "changePassword", currentPassword, newPassword },
				}),
				"Could not change password",
				authMutationOkResponseSchema,
			);
		},
	};
}
