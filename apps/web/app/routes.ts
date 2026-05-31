import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("login", "routes/login.tsx"),
	route("guest/upgrade", "routes/guest.upgrade.tsx"),
	route("logout", "routes/logout.tsx"),
	route("account", "routes/account.tsx"),
	route("admin", "routes/admin.tsx", [
		route("origins", "routes/admin.origins.tsx"),
		route("users", "routes/admin.users.tsx"),
		route("chat-rooms", "routes/admin.chat-rooms.tsx"),
	]),
	route("visitors", "routes/visitors.tsx"),
	route("chat", "routes/chat.tsx"),
] satisfies RouteConfig;
