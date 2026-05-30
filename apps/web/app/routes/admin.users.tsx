import { fail, type MaybeError, success } from "@firtoz/maybe-error";
import type { RoutePath } from "@firtoz/router-toolkit";
import {
	type AdminUserRow,
	type AuthClient,
	GUEST_SESSION_RETENTION_DAYS,
} from "@internal/auth-client";
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

async function runBulkUserAction(
	_auth: AuthClient,
	sessionUserId: string,
	userIds: string[],
	run: (userId: string) => Promise<MaybeError<{ ok: true }>>,
): Promise<MaybeError<{ ok: true }>> {
	if (userIds.length === 0) {
		return fail("No users selected");
	}
	if (userIds.includes(sessionUserId)) {
		return fail("Cannot include your own account");
	}
	for (const id of userIds) {
		const result = await run(id);
		if (!result.success) {
			return fail(result.error);
		}
	}
	return success({ ok: true });
}

export async function action({
	request,
	context,
}: Route.ActionArgs): Promise<MaybeError<{ ok: true }>> {
	const form = await request.formData();
	const intent = String(form.get("intent") ?? "");

	const auth = createRouteAuthClient(request, context);
	const session = await auth.session.requireAdmin();
	if (!session) {
		return fail("Forbidden");
	}

	if (intent === "bulkDelete" || intent === "bulkPromote" || intent === "bulkDemote") {
		const userIds = form.getAll("userIds").map(String).filter(Boolean);
		if (intent === "bulkDelete") {
			return runBulkUserAction(auth, session.user.id, userIds, (id) => auth.admin.deleteUser(id));
		}
		const role = intent === "bulkPromote" ? "admin" : "user";
		return runBulkUserAction(auth, session.user.id, userIds, (id) =>
			auth.admin.setUserRole(id, role),
		);
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
		return success({ ok: true });
	}

	if (intent === "deleteUser") {
		if (userId === session.user.id) {
			return fail("Cannot delete your own account");
		}
		const result = await auth.admin.deleteUser(userId);
		if (!result.success) {
			return fail(result.error);
		}
		return success({ ok: true });
	}

	const role = String(form.get("role") ?? "");
	if (role !== "user" && role !== "admin") {
		return fail("Invalid input");
	}
	const result = await auth.admin.setUserRole(userId, role);
	if (!result.success) {
		return fail(result.error);
	}
	return success({ ok: true });
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
