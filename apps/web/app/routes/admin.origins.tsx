import { env } from "cloudflare:workers";
import { fail, type MaybeError, success } from "@firtoz/maybe-error";
import type { RoutePath } from "@firtoz/router-toolkit";
import { createAuthClient } from "@internal/auth-client";
import { useState } from "react";
import { useFetcher } from "react-router";
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
	const origin = String(form.get("origin") ?? "").trim();
	if (!origin) {
		return fail("Origin URL required");
	}
	const auth = createAuthClient(env.AUTH, request);
	if (!(await auth.session.requireAdmin())) {
		return fail("Forbidden");
	}
	const result = await auth.admin.addOrigin(origin);
	if (!result.success) {
		return fail(result.error);
	}
	return success({ origins: result.result.origins });
}

export default function AdminOriginsRoute({ loaderData }: Route.ComponentProps) {
	const fetcher = useFetcher<typeof action>();
	const [busy, setBusy] = useState(false);
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
					Better Auth only accepts browser requests <strong>with cookies</strong> (sign-in,
					anonymous chat sessions, OAuth callbacks) when the page&apos;s origin is on this list.
					Your web app and the auth worker are different origins, so CORS needs an explicit
					allowlist.
				</p>
				<p>
					In local dev you usually browse the <strong>web</strong> URL (for example{" "}
					<code className="font-mono text-xs">https://starter-web.localhost</code>), which proxies{" "}
					<code className="font-mono text-xs">/api/auth/*</code> to the auth service. Add that
					origin here—not only <code className="font-mono text-xs">http://127.0.0.1:8784</code>,
					which is the auth worker&apos;s direct dev port and not where users normally open the app.
				</p>
				<p>
					Use the full origin only: scheme, host, and port if non-default (no path). Examples:{" "}
					<code className="font-mono text-xs">https://example.com</code>,{" "}
					<code className="font-mono text-xs">http://127.0.0.1:5173</code>. The list is stored in
					auth KV; the first deploy also seeds from the resolved public auth URL,{" "}
					<code className="font-mono text-xs">WEB_DOMAINS</code>,{" "}
					<code className="font-mono text-xs">AUTH_DOMAINS</code>, and related env vars.
				</p>
			</div>
			<ul className="text-sm list-disc pl-5">
				{origins.length === 0 ? (
					<li className="list-none text-gray-500">No origins configured</li>
				) : (
					origins.map((o) => (
						<li key={o}>
							<code>{o}</code>
						</li>
					))
				)}
			</ul>
			<fetcher.Form className="flex flex-col gap-2" method="post" onSubmit={() => setBusy(true)}>
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
					disabled={busy}
				>
					{busy ? "Adding…" : "Add origin"}
				</button>
			</fetcher.Form>
			{fetcher.data?.success === false ? (
				<p className="text-sm text-red-600">{fetcher.data.error}</p>
			) : null}
		</div>
	);
}
