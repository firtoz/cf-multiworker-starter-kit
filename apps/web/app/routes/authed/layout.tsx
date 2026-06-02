import { Outlet } from "react-router";
import { routeAuthClientMiddleware } from "~/lib/route-auth-client";
import type { Route } from "./+types/layout";

export const middleware: Route.MiddlewareFunction[] = [routeAuthClientMiddleware];

export default function AuthedLayout() {
	return <Outlet />;
}
