import type { ChatMessageRow } from "@internal/chat-contract";
import { useEffect } from "react";
import { ChatMessageItem } from "~/components/chat/ChatMessageItem";
import { markChatPerformance } from "~/lib/chat-performance";

type ChatInitialHistoryItemsProps = {
	messages: ChatMessageRow[];
};

const ignoreDelete = (_messageId: string) => {
	// Static SSR history is replaced by the interactive chat client after hydration.
};

export function ChatInitialHistoryItems({ messages }: ChatInitialHistoryItemsProps) {
	useEffect(() => {
		markChatPerformance("initial-history-rendered");
	}, []);

	return (
		<>
			{messages.map((message) => (
				<ChatMessageItem
					key={message.id}
					message={message}
					canModerate={false}
					deleteBusy={false}
					onDelete={ignoreDelete}
				/>
			))}
		</>
	);
}
