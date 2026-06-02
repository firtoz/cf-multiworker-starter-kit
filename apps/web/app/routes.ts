import { index, layout, type RouteConfig, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("login", "routes/login.tsx"),
	route("logout", "routes/logout.tsx"),
	layout("routes/authed/layout.tsx", [
		route("guest/upgrade", "routes/authed/guest.upgrade.tsx"),
		route("account", "routes/authed/account.tsx"),
		route("admin", "routes/authed/admin/layout.tsx", [
			route("origins", "routes/authed/admin/origins.tsx"),
			route("users", "routes/authed/admin/users.tsx"),
			route("chat-rooms", "routes/authed/admin/chat-rooms.tsx"),
		]),
	]),
	route("chat", "routes/chat.tsx"),
	route("visitors", "routes/visitors.tsx"),
] satisfies RouteConfig;
