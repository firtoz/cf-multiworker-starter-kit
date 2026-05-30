import { env } from "cloudflare:workers";
import { fail, type MaybeError, success } from "@firtoz/maybe-error";
import type { RoutePath } from "@firtoz/router-toolkit";
import { createAuthClient } from "@internal/auth-client";
import { useState } from "react";
import { Form, useFetcher } from "react-router";
import type { Route } from "./+types/admin.origins";

export const route: RoutePath<"/admin/origins"> = "/admin/origins";

export function meta(_args: Route.MetaArgs) {
	return [{ title: "Admin — Origins" }];
}

export async function loader({
	request,
}: Route.LoaderArgs): Promise<MaybeError<{ origins: string[] }>> {
	const auth = createAuthClient(env.AUTH, request);
	if (!(await auth.session.requireAdmin())) {
		return fail("Forbidden");
	}
	const result = await auth.admin.listOrigins();
	if (!result.success) {
		return fail(result.error);
	}
	return success({ origins: result.result.origins });
}

export async function action({
	request,
}: Route.ActionArgs): Promise<MaybeError<{ origins: string[] }>> {
	const form = await request.formData();
	const intent = String(form.get("intent") ?? "addOrigin");
	const auth = createAuthClient(env.AUTH, request);
	if (!(await auth.session.requireAdmin())) {
		return fail("Forbidden");
	}

	if (intent === "removeOrigin") {
		const origin = String(form.get("origin") ?? "").trim();
		if (!origin) {
			return fail("Origin required");
		}
		const result = await auth.admin.removeOrigin(origin);
		if (!result.success) {
			return fail(result.error);
		}
		return success({ origins: result.result.origins });
	}

	const origin = String(form.get("origin") ?? "").trim();
	if (!origin) {
		return fail("Origin URL required");
	}
	const result = await auth.admin.addOrigin(origin);
	if (!result.success) {
		return fail(result.error);
	}
	return success({ origins: result.result.origins });
}

export default function AdminOriginsRoute({ loaderData }: Route.ComponentProps) {
	const fetcher = useFetcher<typeof action>();
	const [addBusy, setAddBusy] = useState(false);
	const origins =
		fetcher.data?.success === true
			? fetcher.data.result.origins
			: loaderData.success
				? loaderData.result.origins
				: [];

	if (!loaderData.success) {
		return <p className="text-red-600">{loaderData.error}</p>;
	}

	return (
		<div className="max-w-2xl flex flex-col gap-4">
			<h2 className="text-lg font-semibold">Trusted origins</h2>
			<div className="text-sm text-gray-700 dark:text-gray-300 space-y-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 px-4 py-3">
				<p>
					Better Auth checks the browser <strong>Origin</strong> on cookie-backed requests (sign-in,
					OAuth, anonymous chat). With the default <strong>web-proxy</strong> setup, users and auth
					share the same site origin — e.g.{" "}
					<code className="font-mono text-xs">https://starter-web.localhost</code> in local dev,
					which proxies <code className="font-mono text-xs">/api/auth/*</code> to the auth worker.
				</p>
				<p>
					Add your public web origin here if it is missing. Use the full origin (scheme + host +
					non-default port only). The auth worker is not browsable — only the web app origin.
				</p>
				<p>
					First deploy seeds from <code className="font-mono text-xs">WEB_DOMAINS</code> and related
					env. Stored in auth KV.
				</p>
			</div>
			<ul className="text-sm flex flex-col gap-2">
				{origins.length === 0 ? (
					<li className="text-gray-500">No origins configured</li>
				) : (
					origins.map((o) => (
						<li
							key={o}
							className="flex flex-wrap items-center gap-2 rounded border border-gray-200 dark:border-gray-700 px-3 py-2"
						>
							<code className="flex-1 min-w-0 break-all">{o}</code>
							<Form method="post">
								<input type="hidden" name="intent" value="removeOrigin" />
								<input type="hidden" name="origin" value={o} />
								<button type="submit" className="text-sm text-red-600 dark:text-red-400 underline">
									Remove
								</button>
							</Form>
						</li>
					))
				)}
			</ul>
			<fetcher.Form className="flex flex-col gap-2" method="post" onSubmit={() => setAddBusy(true)}>
				<input type="hidden" name="intent" value="addOrigin" />
				<label className="text-sm font-medium" htmlFor="origin">
					Add origin (full URL, e.g. https://example.com)
				</label>
				<input
					className="border rounded px-3 py-2 text-sm dark:bg-gray-900"
					id="origin"
					name="origin"
					type="url"
					required
					placeholder="https://myapp-web.localhost"
				/>
				<button
					className="self-start rounded bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-4 py-2 text-sm disabled:opacity-50"
					type="submit"
					disabled={addBusy}
				>
					{addBusy ? "Adding…" : "Add origin"}
				</button>
			</fetcher.Form>
			{fetcher.data?.success === false ? (
				<p className="text-sm text-red-600">{fetcher.data.error}</p>
			) : null}
		</div>
	);
}
