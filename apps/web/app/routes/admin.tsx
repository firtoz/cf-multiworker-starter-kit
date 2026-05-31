import { env } from "cloudflare:workers";
import { success } from "@firtoz/maybe-error";
import type { RoutePath } from "@firtoz/router-toolkit";
import { isAdminUser, resolveAuthSession } from "@internal/auth-client";
import { href, Link, Outlet, redirect } from "react-router";
import { BackToHomeLink } from "~/components/shared/BackToHomeLink";
import type { Route } from "./+types/admin";

export const route: RoutePath<"/admin"> = "/admin";

export function meta(_args: Route.MetaArgs) {
	return [{ title: "Admin" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
	const session = await resolveAuthSession(context, env.AUTH, request);
	if (!session || !isAdminUser(session.user)) {
		throw redirect(href("/"));
	}
	return success({ user: session.user });
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
	if (!loaderData.success) {
		return null;
	}

	return (
		<div className="w-full px-4 py-8">
			<BackToHomeLink />
			<div className="flex flex-wrap gap-4 mt-4 mb-6 border-b border-gray-200 dark:border-gray-700 pb-4">
				<Link to={href("/admin/origins")} className="text-sm font-medium underline">
					Trusted origins
				</Link>
				<Link to={href("/admin/users")} className="text-sm font-medium underline">
					Users
				</Link>
				<Link to={href("/admin/chat-rooms")} className="text-sm font-medium underline">
					Chat rooms
				</Link>
				<span className="text-sm text-gray-500 ml-auto">
					{loaderData.result.user.email} (admin)
				</span>
			</div>
			<Outlet />
		</div>
	);
}
