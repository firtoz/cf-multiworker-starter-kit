import type { ChatMessageRow } from "@internal/chat-contract";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChatMessageItem } from "~/components/chat/ChatMessageItem";
import { cn } from "~/lib/cn";

type VirtualizedChatMessageListProps = {
	messages: ChatMessageRow[];
	scrollElementRef: RefObject<HTMLDivElement | null>;
	canModerate: boolean;
	deleteBusy: boolean;
	loadingOlder: boolean;
	onStartReached: () => void;
	onDeleteMessage: (messageId: string) => void;
};

const ESTIMATED_MESSAGE_HEIGHT_PX = 64;
const VIRTUAL_OVERSCAN = 8;
const START_REACHED_INDEX = 4;
const VIRTUAL_ROW_CLASS_NAME = cn("absolute left-0 top-0 w-full");
const VIRTUAL_CONTAINER_CLASS_NAME = cn("relative w-full");

export function VirtualizedChatMessageList({
	messages,
	scrollElementRef,
	canModerate,
	deleteBusy,
	loadingOlder,
	onStartReached,
	onDeleteMessage,
}: VirtualizedChatMessageListProps) {
	const didScrollToInitialEndRef = useRef(false);
	const [initialEndReady, setInitialEndReady] = useState(false);
	const virtualizer = useVirtualizer({
		count: messages.length,
		getScrollElement: () => scrollElementRef.current,
		estimateSize: () => ESTIMATED_MESSAGE_HEIGHT_PX,
		getItemKey: (index) => messages[index]?.id ?? index,
		anchorTo: "end",
		followOnAppend: true,
		scrollEndThreshold: 80,
		overscan: VIRTUAL_OVERSCAN,
	});
	const virtualItems = virtualizer.getVirtualItems();

	useLayoutEffect(() => {
		if (messages.length === 0) {
			didScrollToInitialEndRef.current = false;
			setInitialEndReady(false);
			return;
		}
		if (didScrollToInitialEndRef.current) {
			return;
		}
		didScrollToInitialEndRef.current = true;
		virtualizer.scrollToEnd();
		setInitialEndReady(true);
	}, [messages.length, virtualizer]);

	useEffect(() => {
		if (!initialEndReady || messages.length === 0 || loadingOlder) {
			return;
		}
		const firstMessageIndex = virtualItems.map((item) => item.index).find((index) => index >= 0);
		if (firstMessageIndex !== undefined && firstMessageIndex <= START_REACHED_INDEX) {
			onStartReached();
		}
	}, [initialEndReady, loadingOlder, messages.length, onStartReached, virtualItems]);

	return (
		<>
			{loadingOlder ? (
				// biome-ignore lint/a11y/useSemanticElements: Virtualized chat uses ARIA roles on div rows.
				<div className="pb-2 text-center text-sm text-gray-500" role="listitem">
					<span role="status">Loading older messages...</span>
				</div>
			) : null}
			<div
				className={cn(VIRTUAL_CONTAINER_CLASS_NAME, { invisible: !initialEndReady })}
				style={{
					height: virtualizer.getTotalSize(),
				}}
			>
				{virtualItems.map((virtualItem) => {
					const message = messages[virtualItem.index];
					if (!message) {
						return null;
					}
					return (
						<ChatMessageItem
							key={virtualItem.key}
							ref={virtualizer.measureElement}
							className={VIRTUAL_ROW_CLASS_NAME}
							dataIndex={virtualItem.index}
							message={message}
							canModerate={canModerate}
							deleteBusy={deleteBusy}
							onDelete={onDeleteMessage}
							style={{
								transform: `translateY(${virtualItem.start}px)`,
							}}
						/>
					);
				})}
			</div>
		</>
	);
}
