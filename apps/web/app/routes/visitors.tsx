import { env } from "cloudflare:workers";
import { type MaybeError, success } from "@firtoz/maybe-error";
import type { RoutePath } from "@firtoz/router-toolkit";
import { incrementSiteVisits } from "@internal/db";
import { BackToHomeLink } from "~/components/shared/BackToHomeLink";
import type { Route } from "./+types/visitors";

export const route: RoutePath<"/visitors"> = "/visitors";

export function meta(_args: Route.MetaArgs) {
	return [
		{ title: "Visitor counter" },
		{ name: "description", content: "D1 + Drizzle visitor counter" },
	];
}

export async function loader(_args: Route.LoaderArgs): Promise<MaybeError<{ count: number }>> {
	const count = await incrementSiteVisits(env.DB);
	return success({ count });
}

export default function VisitorsRoute({ loaderData }: Route.ComponentProps) {
	if (!loaderData.success) {
		return (
			<div className="container mx-auto max-w-lg px-4 py-8">
				<BackToHomeLink />
				<p className="mt-6 text-red-600 dark:text-red-400">{loaderData.error}</p>
			</div>
		);
	}
	return (
		<div className="container mx-auto max-w-lg px-4 py-8">
			<BackToHomeLink />
			<h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-6">
				Visitor counter (D1)
			</h1>
			<p className="text-gray-600 dark:text-gray-400 mt-2 text-sm">
				Each load of this page increments a single global row in Cloudflare D1 via Drizzle.
			</p>
			<p
				className="mt-6 text-4xl font-semibold tabular-nums text-blue-600 dark:text-blue-400"
				aria-live="polite"
			>
				{loaderData.result.count}
			</p>
		</div>
	);
}
