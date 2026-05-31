import { fail, type MaybeError, success } from "@firtoz/maybe-error";
import type { RoutePath } from "@firtoz/router-toolkit";
import type { AdminUserRow } from "@internal/auth-db/api-schemas";
import { GUEST_SESSION_RETENTION_DAYS } from "@internal/auth-db/constants";
import { AdminUsersPanel } from "~/components/admin/AdminUsersPanel";
import { createRouteAuthClient } from "~/lib/route-auth-client";
import type { Route } from "./+types/admin.users";

export const route: RoutePath<"/admin/users"> = "/admin/users";

export function meta(_args: Route.MetaArgs) {
	return [{ title: "Admin — Users" }];
}

export async function loader({ request, context }: Route.LoaderArgs): Promise<
	MaybeError<{
		users: AdminUserRow[];
		currentUserId: string;
		guestRetentionDays: number;
		page: number;
		pageSize: number;
		total: number;
		hasMore: boolean;
	}>
> {
	const auth = createRouteAuthClient(request, context);
	const session = await auth.session.requireAdmin();
	if (!session) {
		return fail("Forbidden");
	}
	const url = new URL(request.url);
	const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
	const pageSize = Math.min(
		100,
		Math.max(1, Number(url.searchParams.get("pageSize") ?? "50") || 50),
	);
	const result = await auth.admin.listUsers({ page, pageSize });
	if (!result.success) {
		return fail(result.error);
	}
	return success({
		users: result.result.users,
		currentUserId: session.user.id,
		guestRetentionDays: GUEST_SESSION_RETENTION_DAYS,
		page: result.result.page,
		pageSize: result.result.pageSize,
		total: result.result.total,
		hasMore: result.result.hasMore,
	});
}

export async function action({ request, context }: Route.ActionArgs): Promise<MaybeError> {
	const form = await request.formData();
	const intent = String(form.get("intent") ?? "");

	const auth = createRouteAuthClient(request, context);
	const session = await auth.session.requireAdmin();
	if (!session) {
		return fail("Forbidden");
	}

	if (intent === "bulkDelete" || intent === "bulkPromote" || intent === "bulkDemote") {
		const userIds = form.getAll("userIds").map(String).filter(Boolean);
		if (userIds.length === 0) {
			return fail("No users selected");
		}
		if (userIds.includes(session.user.id)) {
			return fail("Cannot include your own account");
		}
		if (intent === "bulkDelete") {
			const result = await auth.admin.bulkDeleteUsers(userIds);
			if (!result.success) {
				return fail(result.error);
			}
			return success();
		}
		const role = intent === "bulkPromote" ? "admin" : "user";
		const result = await auth.admin.bulkSetUserRole(userIds, role);
		if (!result.success) {
			return fail(result.error);
		}
		return success();
	}

	const userId = String(form.get("userId") ?? "");
	if (!userId) {
		return fail("Invalid input");
	}

	if (intent === "saveName") {
		const name = String(form.get("name") ?? "").trim();
		if (!name) {
			return fail("Display name is required");
		}
		const result = await auth.admin.setUserName(userId, name);
		if (!result.success) {
			return fail(result.error);
		}
		return success();
	}

	if (intent === "deleteUser") {
		if (userId === session.user.id) {
			return fail("Cannot delete your own account");
		}
		const result = await auth.admin.deleteUser(userId);
		if (!result.success) {
			return fail(result.error);
		}
		return success();
	}

	const role = String(form.get("role") ?? "");
	if (role !== "user" && role !== "admin") {
		return fail("Invalid input");
	}
	const result = await auth.admin.setUserRole(userId, role);
	if (!result.success) {
		return fail(result.error);
	}
	return success();
}

export default function AdminUsersRoute({ loaderData, actionData }: Route.ComponentProps) {
	if (!loaderData.success) {
		return <p className="text-red-600">{loaderData.error}</p>;
	}

	const panelProps = {
		users: loaderData.result.users,
		currentUserId: loaderData.result.currentUserId,
		guestRetentionDays: loaderData.result.guestRetentionDays,
		page: loaderData.result.page,
		pageSize: loaderData.result.pageSize,
		total: loaderData.result.total,
		hasMore: loaderData.result.hasMore,
	};
	return (
		<AdminUsersPanel
			{...panelProps}
			{...(actionData && !actionData.success ? { actionError: actionData.error } : {})}
		/>
	);
}
