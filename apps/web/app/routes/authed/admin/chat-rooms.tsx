import { env } from "cloudflare:workers";
import { type MaybeError, success } from "@firtoz/maybe-error";
import type { RoutePath } from "@firtoz/router-toolkit";
import { listChatRooms } from "@internal/db";
import { AdminChatRoomsPanel } from "~/components/admin/AdminChatRoomsPanel";
import type { Route } from "./+types/chat-rooms";

export const route: RoutePath<"/admin/chat-rooms"> = "/admin/chat-rooms";

export function meta(_args: Route.MetaArgs) {
	return [{ title: "Admin — Chat rooms" }];
}

export async function loader(_args: Route.LoaderArgs): Promise<
	MaybeError<{
		rooms: Awaited<ReturnType<typeof listChatRooms>>["rooms"];
		total: number;
	}>
> {
	const { rooms, total } = await listChatRooms(env.DB, { limit: 200 });
	return success({ rooms, total });
}

export default function AdminChatRoomsRoute({ loaderData }: Route.ComponentProps) {
	if (!loaderData.success) {
		return <p className="text-red-600">{loaderData.error}</p>;
	}
	return <AdminChatRoomsPanel rooms={loaderData.result.rooms} total={loaderData.result.total} />;
}
