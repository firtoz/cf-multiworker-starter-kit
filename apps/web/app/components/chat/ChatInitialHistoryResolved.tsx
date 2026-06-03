import type { ChatHistoryPage } from "@internal/chat-contract";
import { useEffect } from "react";

type ChatInitialHistoryResolvedProps = {
	page: ChatHistoryPage;
	onResolve: (page: ChatHistoryPage) => void;
};

export function ChatInitialHistoryResolved({ page, onResolve }: ChatInitialHistoryResolvedProps) {
	useEffect(() => {
		onResolve(page);
	}, [page, onResolve]);
	return null;
}
