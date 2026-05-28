import { env } from "cloudflare:workers";
import { fail, type MaybeError, success } from "@firtoz/maybe-error";
import type { RoutePath } from "@firtoz/router-toolkit";
import { type AdminUserRow, createAuthClient } from "@internal/auth-client";
import { CHAT_DISPLAY_NAME_MAX_CHARS } from "@internal/chat-contract";
import type { Route } from "./+types/admin.users";

export const route: RoutePath<"/admin/users"> = "/admin/users";

export function meta(_args: Route.MetaArgs) {
	return [{ title: "Admin — Users" }];
}

export async function loader({
	request,
}: Route.LoaderArgs): Promise<MaybeError<{ users: AdminUserRow[] }>> {
	const auth = createAuthClient(env.AUTH, request);
	if (!(await auth.session.requireAdmin())) {
		return fail("Forbidden");
	}
	const result = await auth.admin.listUsers();
	if (!result.success) {
		return fail(result.error);
	}
	return success({ users: result.result.users });
}

export async function action({ request }: Route.ActionArgs): Promise<MaybeError<{ ok: true }>> {
	const form = await request.formData();
	const intent = String(form.get("intent") ?? "");
	const userId = String(form.get("userId") ?? "");

	if (!userId) {
		return fail("Invalid input");
	}

	const auth = createAuthClient(env.AUTH, request);
	if (!(await auth.session.requireAdmin())) {
		return fail("Forbidden");
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

	return (
		<div className="max-w-3xl">
			<h2 className="text-lg font-semibold mb-4">Users</h2>
			{actionData && !actionData.success ? (
				<p className="text-sm text-red-600 mb-4">{actionData.error}</p>
			) : null}
			<table className="w-full text-sm border-collapse">
				<thead>
					<tr className="text-left border-b border-gray-200 dark:border-gray-700">
						<th className="py-2 pr-4">Name</th>
						<th className="py-2 pr-4">Email</th>
						<th className="py-2 pr-4">Role</th>
						<th className="py-2">Actions</th>
					</tr>
				</thead>
				<tbody>
					{loaderData.result.users.map((u) => (
						<tr key={u.id} className="border-b border-gray-100 dark:border-gray-800">
							<td className="py-2 pr-4 align-top">
								<form method="post" className="flex flex-wrap items-center gap-2 max-w-xs">
									<input type="hidden" name="intent" value="saveName" />
									<input type="hidden" name="userId" value={u.id} />
									<input
										className="flex-1 min-w-[8rem] border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm dark:bg-gray-900"
										name="name"
										defaultValue={u.name}
										maxLength={CHAT_DISPLAY_NAME_MAX_CHARS}
										required
										aria-label={`Display name for ${u.email}`}
									/>
									<button type="submit" className="text-xs underline shrink-0">
										Save
									</button>
								</form>
							</td>
							<td className="py-2 pr-4 font-mono text-xs align-top">{u.email}</td>
							<td className="py-2 pr-4 align-top">{u.role}</td>
							<td className="py-2 align-top">
								{u.role === "admin" ? (
									<form method="post" className="inline">
										<input type="hidden" name="userId" value={u.id} />
										<input type="hidden" name="role" value="user" />
										<button type="submit" className="text-xs underline">
											Demote to user
										</button>
									</form>
								) : (
									<form method="post" className="inline">
										<input type="hidden" name="userId" value={u.id} />
										<input type="hidden" name="role" value="admin" />
										<button type="submit" className="text-xs underline">
											Promote to admin
										</button>
									</form>
								)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
