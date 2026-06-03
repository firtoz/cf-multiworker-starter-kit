import { waitForBrowserSession } from "@internal/auth-client/browser-client";
import { accountDisplayName } from "@internal/auth-client/display-name";
import type { AuthUser } from "@internal/auth-client/roles";
import type { ChatHistoryPage } from "@internal/chat-contract";
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useState } from "react";
import { ChatClientWithSocket } from "~/components/chat/ChatClientWithSocket";
import { ChatView, type ChatViewToolbarProps } from "~/components/chat/ChatView";
import { ChatWaitingMessages } from "~/components/chat/ChatWaitingMessages";
import { markChatPerformance } from "~/lib/chat-performance";

export type ChatClientProps = {
	user: AuthUser;
	sessionExpiresAt: string;
	guestRetentionDays: number;
	pendingAuthCookies: boolean;
	chatAttestToken: string;
	chatAttestRoom: string;
	initialMessages: Promise<ChatHistoryPage>;
	canModerate: boolean;
	saveNameError?: string;
};

const noop = () => {
	// Static controls become interactive after the socket controller mounts.
};

const noopString = (_value: string) => {
	// Static controls become interactive after the socket controller mounts.
};

const noopKeyDown = (_event: ReactKeyboardEvent<HTMLInputElement>) => {
	// Static controls become interactive after the socket controller mounts.
};

/** Wait until HttpOnly auth cookies from the loader are visible to the browser before opening Socka. */
export function ChatClient(props: ChatClientProps) {
	const [browserReady, setBrowserReady] = useState(false);
	const [wsConnectReady, setWsConnectReady] = useState(!props.pendingAuthCookies);
	const room = props.chatAttestRoom;

	useEffect(() => {
		markChatPerformance("client-mounted");
		setBrowserReady(true);
	}, []);

	useEffect(() => {
		if (!props.pendingAuthCookies) {
			return;
		}
		let cancelled = false;
		void (async () => {
			if (!cancelled && (await waitForBrowserSession())) {
				setWsConnectReady(true);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [props.pendingAuthCookies]);

	const waitingStatus = browserReady
		? wsConnectReady
			? null
			: "Starting session"
		: "Preparing chat";
	if (!waitingStatus) {
		return <ChatClientWithSocket {...props} />;
	}

	const toolbar: ChatViewToolbarProps = {
		nameDraft: accountDisplayName(props.user) ?? "Guest",
		ready: false,
		roomInput: room,
		committedRoom: room,
		canSwitchRoom: false,
		roomInputInvalid: false,
		joinIsRedundant: true,
		onNameChange: noopString,
		onSaveName: noop,
		onRevertName: noop,
		onBeginEditName: noop,
		onRoomChange: noopString,
		onRoomKeyDown: noopKeyDown,
		onJoin: noop,
	};

	return (
		<ChatView
			user={props.user}
			sessionExpiresAt={props.sessionExpiresAt}
			guestRetentionDays={props.guestRetentionDays}
			status={waitingStatus}
			room={room}
			saveNameError={props.saveNameError}
			canModerate={props.canModerate}
			toolbar={toolbar}
			messageInputDisabled={true}
			sendDisabled={true}
		>
			<ChatWaitingMessages />
		</ChatView>
	);
}
