import type { TypedHonoFetcher } from "@firtoz/hono-fetcher";
import type { MaybeError } from "@firtoz/maybe-error";
import {
	type AdminOkResponse,
	type AdminOriginsResponse,
	type AdminSetUserNameResponse,
	type AdminUsersResponse,
	adminOkResponseSchema,
	adminOriginsResponseSchema,
	adminSetUserNameResponseSchema,
	adminUsersResponseSchema,
} from "@internal/auth-db/api-schemas";
import type { AdminApp } from "auth-worker/admin";
import type { HonoClientApp } from "../binding/hono-client-app";
import { parseBindingJson } from "./parse-json";

type AdminAppClient = HonoClientApp<AdminApp>;

export function createAdminApi(api: TypedHonoFetcher<AdminAppClient>) {
	return {
		listUsers(query?: {
			page?: number;
			pageSize?: number;
		}): Promise<MaybeError<AdminUsersResponse>> {
			const params = new URLSearchParams();
			if (query?.page != null) {
				params.set("page", String(query.page));
			}
			if (query?.pageSize != null) {
				params.set("pageSize", String(query.pageSize));
			}
			const qs = params.toString();
			return parseBindingJson(
				api.get({ url: (qs ? `/users?${qs}` : "/users") as "/users" }),
				"Failed to load users",
				adminUsersResponseSchema,
			);
		},
		listOrigins(): Promise<MaybeError<AdminOriginsResponse>> {
			return parseBindingJson(
				api.get({ url: "/origins" }),
				"Failed to load origins",
				adminOriginsResponseSchema,
			);
		},
		addOrigin(origin: string): Promise<MaybeError<AdminOriginsResponse>> {
			return parseBindingJson(
				api.post({ url: "/origins/add", body: { origin } }),
				"Could not add origin",
				adminOriginsResponseSchema,
			);
		},
		removeOrigin(origin: string): Promise<MaybeError<AdminOriginsResponse>> {
			return parseBindingJson(
				api.delete({ url: "/origins/:origin", params: { origin } }),
				"Could not remove origin",
				adminOriginsResponseSchema,
			);
		},
		setUserRole(userId: string, role: "user" | "admin"): Promise<MaybeError<AdminOkResponse>> {
			return parseBindingJson(
				api.post({ url: "/users/:id/role", params: { id: userId }, body: { role } }),
				"Update failed",
				adminOkResponseSchema,
			);
		},
		setUserName(userId: string, name: string): Promise<MaybeError<AdminSetUserNameResponse>> {
			return parseBindingJson(
				api.post({ url: "/users/:id/name", params: { id: userId }, body: { name } }),
				"Could not save name",
				adminSetUserNameResponseSchema,
			);
		},
		deleteUser(userId: string): Promise<MaybeError<AdminOkResponse>> {
			return parseBindingJson(
				api.delete({ url: "/users/:id", params: { id: userId } }),
				"Delete failed",
				adminOkResponseSchema,
			);
		},
		bulkDeleteUsers(userIds: string[]): Promise<MaybeError<AdminOkResponse>> {
			return parseBindingJson(
				api.post({ url: "/users/bulk-delete", body: { userIds } }),
				"Bulk delete failed",
				adminOkResponseSchema,
			);
		},
		bulkSetUserRole(
			userIds: string[],
			role: "user" | "admin",
		): Promise<MaybeError<AdminOkResponse>> {
			return parseBindingJson(
				api.post({ url: "/users/bulk-role", body: { userIds, role } }),
				"Bulk update failed",
				adminOkResponseSchema,
			);
		},
	};
}
