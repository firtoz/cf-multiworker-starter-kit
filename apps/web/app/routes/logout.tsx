import { env } from "cloudflare:workers";
import type { RoutePath } from "@firtoz/router-toolkit";
import { signOut } from "@internal/auth-client/sign-out";
import { href, redirect } from "react-router";
import type { Route } from "./+types/logout";

export const route: RoutePath<"/logout"> = "/logout";

/** POST only — clears session cookies and returns to home. */
export async function action({ request }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw redirect(href("/"));
	}

	const setCookieHeaders = await signOut(env.AUTH, request);
	const headers = new Headers();
	for (const cookie of setCookieHeaders) {
		headers.append("Set-Cookie", cookie);
	}
	throw redirect(href("/"), { headers });
}

export default function LogoutRoute() {
	return null;
}
