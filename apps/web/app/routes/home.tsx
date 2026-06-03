import { type MaybeError, success } from "@firtoz/maybe-error";
import type { RoutePath } from "@firtoz/router-toolkit";
import { href, Link } from "react-router";
import { Welcome } from "../welcome/welcome";
import type { Route } from "./+types/home";

export const route: RoutePath<"/"> = "/";

export function meta(_args: Route.MetaArgs) {
	return [
		{ title: "Cloudflare Multi-Worker App" },
		{ name: "description", content: "A starter kit for Cloudflare Workers with React Router" },
	];
}

export async function loader(_args: Route.LoaderArgs): Promise<MaybeError<Record<string, never>>> {
	return success({});
}

export default function Home({ loaderData }: Route.ComponentProps) {
	if (!loaderData.success) {
		return (
			<div className="container mx-auto px-4 py-4 sm:px-6 sm:py-6">
				<p className="text-red-600 dark:text-red-400">{loaderData.error}</p>
			</div>
		);
	}

	return (
		<div className="container mx-auto px-4 py-4 sm:px-6 sm:py-6">
			<Welcome />

			<div className="max-w-[600px] mx-auto mt-6 sm:mt-8 p-4 sm:p-6 bg-blue-50 dark:bg-blue-900/30 border border-gray-200 dark:border-gray-700 rounded-2xl sm:rounded-3xl">
				<h2 className="text-xl sm:text-2xl font-bold mb-2 text-gray-800 dark:text-gray-100">
					What&apos;s in this starter
				</h2>
				<p className="text-sm sm:text-base text-gray-700 dark:text-gray-300 mb-4">
					Try a{" "}
					<Link className="text-blue-600 dark:text-blue-400 underline" to={href("/visitors")}>
						D1 visitor counter
					</Link>{" "}
					(SQL at the edge) and{" "}
					<Link className="text-blue-600 dark:text-blue-400 underline" to={href("/chat")}>
						multi-room chat
					</Link>{" "}
					(anonymous guests or sign-in, Socka + chatroom worker + DO SQLite).
				</p>
			</div>
		</div>
	);
}
