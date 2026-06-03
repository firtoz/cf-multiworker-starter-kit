import type { ChatMessageRow } from "@internal/chat-contract";
import { Suspense } from "react";
import { Await } from "react-router";
import { ChatInitialHistoryError } from "~/components/chat/ChatInitialHistoryError";
import { ChatInitialHistoryResolved } from "~/components/chat/ChatInitialHistoryResolved";
import { ChatMessageItem } from "~/components/chat/ChatMessageItem";

type ChatLiveMessagesProps = {
	committedRoom: string;
	chatAttestRoom: string;
	initialHistoryStatus: "pending" | "ready" | "error";
	initialMessages: Promise<ChatMessageRow[]>;
	messages: ChatMessageRow[];
	canModerate: boolean;
	deleteBusy: boolean;
	onInitialHistoryError: () => void;
	onInitialHistoryResolve: (history: ChatMessageRow[]) => void;
	onDeleteMessage: (messageId: string) => void;
};

export function ChatLiveMessages({
	committedRoom,
	chatAttestRoom,
	initialHistoryStatus,
	initialMessages,
	messages,
	canModerate,
	deleteBusy,
	onInitialHistoryError,
	onInitialHistoryResolve,
	onDeleteMessage,
}: ChatLiveMessagesProps) {
	return (
		<>
			{committedRoom === chatAttestRoom && initialHistoryStatus === "pending" ? (
				<Suspense
					fallback={
						messages.length === 0 ? (
							<li className="text-sm text-gray-500">Loading message history...</li>
						) : null
					}
				>
					<Await
						resolve={initialMessages}
						errorElement={<ChatInitialHistoryError onError={onInitialHistoryError} />}
					>
						{(history) => (
							<ChatInitialHistoryResolved messages={history} onResolve={onInitialHistoryResolve} />
						)}
					</Await>
				</Suspense>
			) : null}
			{messages.map((message) => (
				<ChatMessageItem
					key={message.id}
					message={message}
					canModerate={canModerate}
					deleteBusy={deleteBusy}
					onDelete={onDeleteMessage}
				/>
			))}
		</>
	);
}
