import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("login", "routes/login.tsx"),
	route("account", "routes/account.tsx"),
	route("admin", "routes/admin.tsx", [
		route("origins", "routes/admin.origins.tsx"),
		route("users", "routes/admin.users.tsx"),
	]),
	route("visitors", "routes/visitors.tsx"),
	route("chat", "routes/chat.tsx"),
	route("ping-do", "routes/ping-do.tsx"),
] satisfies RouteConfig;
