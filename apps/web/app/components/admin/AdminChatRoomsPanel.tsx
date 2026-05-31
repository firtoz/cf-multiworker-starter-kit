import type { ChatRoomRow } from "@internal/db";
import { href, Link } from "react-router";
import { formatAdminTimestamp } from "./admin-user-dates";

type AdminChatRoomsPanelProps = {
	rooms: ChatRoomRow[];
	total: number;
	actionError?: string | undefined;
};

export function AdminChatRoomsPanel({ rooms, total, actionError }: AdminChatRoomsPanelProps) {
	return (
		<div className="space-y-4">
			<h2 className="text-lg font-semibold">Chat rooms</h2>
			<p className="text-sm text-gray-600 dark:text-gray-400">
				Rooms are registered in app D1 when first visited. Admins can join any room and delete
				messages from the chat UI.
			</p>
			{actionError ? <p className="text-red-600 dark:text-red-400 text-sm">{actionError}</p> : null}
			<p className="text-sm text-gray-500">{total} room(s) registered</p>
			{rooms.length === 0 ? (
				<p className="text-gray-500">
					No rooms yet — open{" "}
					<Link to={href("/chat")} className="underline">
						/chat
					</Link>{" "}
					to create one.
				</p>
			) : (
				<div className="overflow-x-auto">
					<table className="min-w-full text-sm border border-gray-200 dark:border-gray-700">
						<thead>
							<tr className="bg-gray-50 dark:bg-gray-900/40 text-left">
								<th className="px-3 py-2 font-medium">Room</th>
								<th className="px-3 py-2 font-medium">Created</th>
								<th className="px-3 py-2 font-medium">Last active</th>
								<th className="px-3 py-2 font-medium">Actions</th>
							</tr>
						</thead>
						<tbody>
							{rooms.map((room) => (
								<tr key={room.id} className="border-t border-gray-200 dark:border-gray-700">
									<td className="px-3 py-2 font-mono">{room.id}</td>
									<td className="px-3 py-2">{formatAdminTimestamp(room.createdAt)}</td>
									<td className="px-3 py-2">{formatAdminTimestamp(room.lastActiveAt)}</td>
									<td className="px-3 py-2">
										<Link
											to={`${href("/chat")}?room=${encodeURIComponent(room.id)}`}
											className="underline"
										>
											Join
										</Link>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
