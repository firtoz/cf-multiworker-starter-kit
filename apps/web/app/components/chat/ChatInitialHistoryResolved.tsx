import type { ChatMessageRow } from "@internal/chat-contract";
import { useEffect } from "react";

type ChatInitialHistoryResolvedProps = {
	messages: ChatMessageRow[];
	onResolve: (messages: ChatMessageRow[]) => void;
};

export function ChatInitialHistoryResolved({
	messages,
	onResolve,
}: ChatInitialHistoryResolvedProps) {
	useEffect(() => {
		onResolve(messages);
	}, [messages, onResolve]);
	return null;
}
