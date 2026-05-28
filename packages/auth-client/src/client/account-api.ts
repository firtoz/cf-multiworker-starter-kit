import type { MaybeError } from "@firtoz/maybe-error";
import type { AccountSummary } from "@internal/auth-db/api-schemas";
import type { createAuthBindingFetch } from "../binding/auth-binding-fetch";
import { parseBindingJson } from "./parse-binding-json";

export function createAccountApi(fetch: ReturnType<typeof createAuthBindingFetch>) {
	return {
		getSummary(): Promise<MaybeError<AccountSummary>> {
			return parseBindingJson(fetch("/api/account"), "Could not load account");
		},
		async setNotificationEmail(emailId: string): Promise<MaybeError<{ ok: true }>> {
			const result = await parseBindingJson<{ ok: true }>(
				fetch("/api/account", {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ intent: "setNotificationEmail", emailId }),
				}),
				"Could not update notification email",
			);
			return result;
		},
		async addContactEmail(email: string): Promise<MaybeError<{ ok: true; emailId: string }>> {
			return parseBindingJson(
				fetch("/api/account", {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ intent: "addContactEmail", email }),
				}),
				"Could not add email",
			);
		},
		async setSignInEmail(emailId: string): Promise<MaybeError<{ ok: true }>> {
			return parseBindingJson(
				fetch("/api/account", {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ intent: "setSignInEmail", emailId }),
				}),
				"Could not update sign-in email",
			);
		},
		async setPassword(newPassword: string): Promise<MaybeError<{ ok: true }>> {
			return parseBindingJson(
				fetch("/api/account/password", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ intent: "setPassword", newPassword }),
				}),
				"Could not set password",
			);
		},
		async changePassword(
			currentPassword: string,
			newPassword: string,
		): Promise<MaybeError<{ ok: true }>> {
			return parseBindingJson(
				fetch("/api/account/password", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ intent: "changePassword", currentPassword, newPassword }),
				}),
				"Could not change password",
			);
		},
	};
}
