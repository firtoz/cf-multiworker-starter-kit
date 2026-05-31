import type { ChatMessageRow } from "@internal/chat-contract";
import { chatAuthorNameClassName } from "~/components/chat/chat-display-name-styles";

type ChatMessageItemProps = {
	message: ChatMessageRow;
	canModerate: boolean;
	deleteBusy: boolean;
	onDelete: (messageId: string) => void;
};

export function ChatMessageItem({
	message,
	canModerate,
	deleteBusy,
	onDelete,
}: ChatMessageItemProps) {
	return (
		<li className="text-sm wrap-break-word">
			<div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
				<span className={chatAuthorNameClassName(message.isGuest)}>{message.displayName}</span>
				<span className="text-gray-500 text-xs">{new Date(message.ts).toLocaleTimeString()}</span>
				{canModerate ? (
					<button
						type="button"
						disabled={deleteBusy}
						onClick={() => {
							onDelete(message.id);
						}}
						className="text-xs text-red-600 dark:text-red-400 underline disabled:opacity-50 ml-auto sm:ml-0"
					>
						Delete
					</button>
				) : null}
			</div>
			<p className="text-gray-700 dark:text-gray-300 mt-0.5">{message.text}</p>
		</li>
	);
}
