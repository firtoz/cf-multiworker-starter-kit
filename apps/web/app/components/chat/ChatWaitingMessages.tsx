import type { ChatMessageRow } from "@internal/chat-contract";
import { Suspense } from "react";
import { Await } from "react-router";
import { ChatInitialHistoryError } from "~/components/chat/ChatInitialHistoryError";
import { ChatInitialHistoryItems } from "~/components/chat/ChatInitialHistoryItems";

type ChatWaitingMessagesProps = {
	initialMessages: Promise<ChatMessageRow[]>;
	onError: () => void;
};

export function ChatWaitingMessages({ initialMessages, onError }: ChatWaitingMessagesProps) {
	return (
		<Suspense fallback={<li className="text-sm text-gray-500">Loading message history...</li>}>
			<Await resolve={initialMessages} errorElement={<ChatInitialHistoryError onError={onError} />}>
				{(messages) => <ChatInitialHistoryItems messages={messages} />}
			</Await>
		</Suspense>
	);
}
