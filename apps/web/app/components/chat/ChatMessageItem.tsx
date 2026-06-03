import type { ChatMessageRow } from "@internal/chat-contract";
import { type CSSProperties, forwardRef } from "react";
import { chatAuthorNameClassName } from "~/components/chat/chat-display-name-styles";
import { LocalDateTime } from "~/components/shared/LocalDateTime";
import { cn } from "~/lib/cn";

type ChatMessageItemProps = {
	message: ChatMessageRow;
	canModerate: boolean;
	deleteBusy: boolean;
	onDelete: (messageId: string) => void;
	className?: string | undefined;
	style?: CSSProperties | undefined;
	dataIndex?: number | undefined;
};

const MESSAGE_TIME_OPTIONS = {
	timeStyle: "short",
} satisfies Intl.DateTimeFormatOptions;

export const ChatMessageItem = forwardRef<HTMLDivElement, ChatMessageItemProps>(
	function ChatMessageItem(
		{ message, canModerate, deleteBusy, onDelete, className, style, dataIndex },
		ref,
	) {
		return (
			// biome-ignore lint/a11y/useSemanticElements: Virtualized chat rows are measured divs inside a role=list container.
			<div
				ref={ref}
				className={cn("py-1.5 text-sm wrap-break-word", className)}
				data-index={dataIndex}
				style={style}
				role="listitem"
			>
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
				<p className="mt-0.5 whitespace-pre-wrap text-gray-700 dark:text-gray-300">
					{message.text}
				</p>
			</div>
		);
	},
);
