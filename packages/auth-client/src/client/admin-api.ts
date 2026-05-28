import type { MaybeError } from "@firtoz/maybe-error";
import type {
	AdminOkResponse,
	AdminOriginsResponse,
	AdminSetUserNameResponse,
	AdminUsersResponse,
} from "@internal/auth-db/api-schemas";
import type { createAuthBindingFetch } from "../binding/auth-binding-fetch";
import { parseBindingJson } from "./parse-binding-json";

export type AuthBindingFetch = ReturnType<typeof createAuthBindingFetch>;

export function createAdminApi(fetch: AuthBindingFetch) {
	return {
		listUsers(): Promise<MaybeError<AdminUsersResponse>> {
			return parseBindingJson(fetch("/admin/users"), "Failed to load users");
		},
		listOrigins(): Promise<MaybeError<AdminOriginsResponse>> {
			return parseBindingJson(fetch("/admin/origins"), "Failed to load origins");
		},
		addOrigin(origin: string): Promise<MaybeError<AdminOriginsResponse>> {
			return parseBindingJson(
				fetch("/admin/origins/add", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ origin }),
				}),
				"Could not add origin",
			);
		},
		setUserRole(userId: string, role: "user" | "admin"): Promise<MaybeError<AdminOkResponse>> {
			return parseBindingJson(
				fetch(`/admin/users/${encodeURIComponent(userId)}/role`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ role }),
				}),
				"Update failed",
			);
		},
		setUserName(userId: string, name: string): Promise<MaybeError<AdminSetUserNameResponse>> {
			return parseBindingJson(
				fetch(`/admin/users/${encodeURIComponent(userId)}/name`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name }),
				}),
				"Could not save name",
			);
		},
	};
}
