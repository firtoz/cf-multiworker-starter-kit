import type { ChatHistoryPage, ChatMessageRow } from "@internal/chat-contract";
import { type RefObject, Suspense } from "react";
import { Await } from "react-router";
import { ChatInitialHistoryError } from "~/components/chat/ChatInitialHistoryError";
import { ChatInitialHistoryResolved } from "~/components/chat/ChatInitialHistoryResolved";
import { VirtualizedChatMessageList } from "~/components/chat/VirtualizedChatMessageList";

type ChatLiveMessagesProps = {
	committedRoom: string;
	chatAttestRoom: string;
	initialHistoryStatus: "pending" | "ready" | "error";
	initialMessages: Promise<ChatHistoryPage>;
	messages: ChatMessageRow[];
	messageListRef: RefObject<HTMLDivElement | null>;
	canModerate: boolean;
	deleteBusy: boolean;
	historyLoadingOlder: boolean;
	onInitialHistoryError: () => void;
	onInitialHistoryResolve: (page: ChatHistoryPage) => void;
	onStartReached: () => void;
	onDeleteMessage: (messageId: string) => void;
};

export function ChatLiveMessages({
	committedRoom,
	chatAttestRoom,
	initialHistoryStatus,
	initialMessages,
	messages,
	messageListRef,
	canModerate,
	deleteBusy,
	historyLoadingOlder,
	onInitialHistoryError,
	onInitialHistoryResolve,
	onStartReached,
	onDeleteMessage,
}: ChatLiveMessagesProps) {
	return (
		<>
			{committedRoom === chatAttestRoom && initialHistoryStatus === "pending" ? (
				<Suspense
					fallback={
						messages.length === 0 ? (
							// biome-ignore lint/a11y/useSemanticElements: Virtualized chat uses ARIA roles on div rows.
							<div className="text-sm text-gray-500" role="listitem">
								Loading message history...
							</div>
						) : null
					}
				>
					<Await
						resolve={initialMessages}
						errorElement={<ChatInitialHistoryError onError={onInitialHistoryError} />}
					>
						{(history) => (
							<ChatInitialHistoryResolved page={history} onResolve={onInitialHistoryResolve} />
						)}
					</Await>
				</Suspense>
			) : null}
			<VirtualizedChatMessageList
				messages={messages}
				scrollElementRef={messageListRef}
				canModerate={canModerate}
				deleteBusy={deleteBusy}
				loadingOlder={historyLoadingOlder}
				onStartReached={onStartReached}
				onDeleteMessage={onDeleteMessage}
			/>
		</>
	);
}
