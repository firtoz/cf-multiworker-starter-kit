import type { ChatMessageRow } from "@internal/chat-contract";
import { chatAuthorNameClassName } from "~/components/chat/chat-display-name-styles";
import { LocalDateTime } from "~/components/shared/LocalDateTime";

type ChatMessageItemProps = {
	message: ChatMessageRow;
	canModerate: boolean;
	deleteBusy: boolean;
	onDelete: (messageId: string) => void;
};

const MESSAGE_TIME_OPTIONS = {
	timeStyle: "short",
} satisfies Intl.DateTimeFormatOptions;

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
				<LocalDateTime
					className="text-gray-500 text-xs"
					value={message.ts}
					options={MESSAGE_TIME_OPTIONS}
				/>
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
