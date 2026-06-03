import { isAdminUser } from "@internal/auth-client/roles";
import { href, type RouterContextProvider, redirect } from "react-router";
import {
	adminAuthSessionContext,
	resolveAuthSession,
	signedInAuthSessionContext,
} from "./route-context.server";

type RouteMiddlewareArgs = {
	context: Readonly<RouterContextProvider>;
	request: Request;
};

export async function requireSignedInMiddleware({
	request,
	context,
}: RouteMiddlewareArgs): Promise<void> {
	const session = await resolveAuthSession(context);
	const url = new URL(request.url);
	const redirectTo = `${url.pathname}${url.search}`;
	if (!session) {
		throw redirect(`${href("/login")}?redirectTo=${encodeURIComponent(redirectTo)}`);
	}
	if (session.user.isAnonymous === true) {
		throw redirect(`${href("/guest/upgrade")}?redirectTo=${encodeURIComponent(redirectTo)}`);
	}
	context.set(signedInAuthSessionContext, session);
}

export async function requireAdminMiddleware({
	context,
}: Pick<RouteMiddlewareArgs, "context">): Promise<void> {
	const session = await resolveAuthSession(context);
	if (!session || !isAdminUser(session.user)) {
		throw redirect(href("/"));
	}
	context.set(signedInAuthSessionContext, session);
	context.set(adminAuthSessionContext, session);
}
