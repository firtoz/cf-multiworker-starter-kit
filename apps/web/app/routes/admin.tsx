import { env } from "cloudflare:workers";
import { type MaybeError, success } from "@firtoz/maybe-error";
import type { RoutePath } from "@firtoz/router-toolkit";
import { requireAdmin } from "@internal/auth-client";
import { href, Link, Outlet, redirect } from "react-router";
import { BackToHomeLink } from "~/components/shared/BackToHomeLink";
import type { Route } from "./+types/admin";

export const route: RoutePath<"/admin"> = "/admin";

export function meta(_args: Route.MetaArgs) {
	return [{ title: "Admin" }];
}

export async function loader({
	request,
}: Route.LoaderArgs): Promise<MaybeError<{ user: { email: string; role: string } }>> {
	const session = await requireAdmin(env.AUTH, request);
	if (!session) {
		throw redirect(href("/"));
	}
	return success({ user: session.user });
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
	if (!loaderData.success) {
		return (
			<div className="container mx-auto px-4 py-8">
				<p className="text-red-600">{loaderData.error}</p>
			</div>
		);
	}

	return (
		<div className="container mx-auto px-4 py-8">
			<BackToHomeLink />
			<div className="flex flex-wrap gap-4 mt-4 mb-6 border-b border-gray-200 dark:border-gray-700 pb-4">
				<Link to={href("/admin/origins")} className="text-sm font-medium underline">
					Trusted origins
				</Link>
				<Link to={href("/admin/users")} className="text-sm font-medium underline">
					Users
				</Link>
				<span className="text-sm text-gray-500 ml-auto">
					{loaderData.result.user.email} (admin)
				</span>
			</div>
			<Outlet />
		</div>
	);
}
