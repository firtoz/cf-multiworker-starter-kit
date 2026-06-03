import type { InferSockaPushHandlers } from "@firtoz/socka";
import { useSockaSession } from "@firtoz/socka/react";
import { accountDisplayName } from "@internal/auth-client/display-name";
import { type ChatMessageRow, chatContract } from "@internal/chat-contract";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useFetcher, useSearchParams } from "react-router";
import type { ChatClientProps } from "~/components/chat/ChatClient";
import { ChatLiveMessages } from "~/components/chat/ChatLiveMessages";
import { ChatView, type ChatViewToolbarProps } from "~/components/chat/ChatView";
import { markChatPerformance, measureChatPerformance } from "~/lib/chat-performance";
import {
	buildChatWsUrl,
	isChatRoomIdInputValid,
	normalizeChatRoomIdInput,
	roomFromQueryParams,
	sanitizeChatRoomId,
} from "~/lib/chat-ws-url";

type PresenceLine = { userId: string; displayName: string; isGuest: boolean };
type ChatAttestResponse = { ok: true; room: string; token: string } | { ok: false; error: string };

/** Treat as pinned when within a few CSS px of the true bottom (avoids subpixel / rounding drift). */
const BOTTOM_STICKY_PX = 4;

function mergeMessages(
	history: ChatMessageRow[],
	current: ChatMessageRow[],
	deletedIds: ReadonlySet<string>,
): ChatMessageRow[] {
	const byId = new Map<string, ChatMessageRow>();
	for (const message of history) {
		if (!deletedIds.has(message.id)) {
			byId.set(message.id, message);
		}
	}
	for (const message of current) {
		if (!deletedIds.has(message.id)) {
			byId.set(message.id, message);
		}
	}
	return [...byId.values()].sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id));
}

async function mintChatAttestToken(room: string): Promise<{ room: string; token: string }> {
	const response = await fetch("/api/chat/attest", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ room }),
	});
	const payload = (await response.json()) as ChatAttestResponse;
	if (!response.ok || !payload.ok) {
		throw new Error(payload.ok ? `HTTP ${response.status}` : payload.error);
	}
	return { room: payload.room, token: payload.token };
}

function withYouLabel(
	selfUserId: string,
	users: { userId: string; displayName: string; isGuest: boolean }[],
): PresenceLine[] {
	return users.map((user) => ({
		...user,
		displayName: user.userId === selfUserId ? `${user.displayName} (you)` : user.displayName,
	}));
}

export function ChatClientWithSocket({
	user,
	sessionExpiresAt,
	guestRetentionDays,
	saveNameError,
	chatAttestToken,
	chatAttestRoom,
	initialMessages,
	canModerate,
}: Omit<ChatClientProps, "pendingAuthCookies">) {
	const saveNameFetcher = useFetcher<
		| { success: true; result: { displayName: string } }
		| { success: false; error: string }
		| undefined
	>();
	const deleteMessageFetcher = useFetcher<
		{ success: true; result: true } | { success: false; error: string } | undefined
	>();
	const pendingSockaDisplayName = useRef<string | null>(null);
	const [searchParams, setSearchParams] = useSearchParams();
	const [roomInput, setRoomInput] = useState(() => roomFromQueryParams(searchParams));
	/** WebSocket and URL reflect this, not the Room field while you type. */
	const [committedRoom, setCommittedRoom] = useState(() => roomFromQueryParams(searchParams));
	const profileName = accountDisplayName(user) ?? "Guest";
	/** Shown in the name field; anonymous guests and members without a name may edit. */
	const [nameDraft, setNameDraft] = useState(profileName);
	const [messages, setMessages] = useState<ChatMessageRow[]>([]);
	const [presence, setPresence] = useState<PresenceLine[]>([]);
	const [socketError, setSocketError] = useState<string | null>(null);
	const [roomAttest, setRoomAttest] = useState<{ room: string; token: string } | null>(null);
	const [joinPending, setJoinPending] = useState(false);
	const [openedRoom, setOpenedRoom] = useState<string | null>(null);
	const [initialHistoryStatus, setInitialHistoryStatus] = useState<"pending" | "ready" | "error">(
		"pending",
	);
	/** `useLayoutEffect` needs self in deps; ref alone can lag behind first `messages` paint. */
	const [selfUserId, setSelfUserId] = useState<string | null>(null);
	const selfUserIdRef = useRef<string | null>(null);
	const messageListRef = useRef<HTMLUListElement | null>(null);
	const deletedMessageIdsRef = useRef(new Set<string>());
	/** True if the user is at (or we just snapped to) the true bottom. */
	const stuckToBottomRef = useRef(true);
	/** Revert name field on blur/Esc to what it was on last focus. */
	const nameFieldSnap = useRef(nameDraft);
	const didRunRoomResetRef = useRef(false);
	const initialMessagesRef = useRef(initialMessages);

	useEffect(() => {
		markChatPerformance("socket-controller-mounted");
	}, []);

	const wsUrl = useMemo(() => {
		const token =
			committedRoom === chatAttestRoom
				? chatAttestToken
				: roomAttest?.room === committedRoom
					? roomAttest.token
					: undefined;
		return buildChatWsUrl(committedRoom, token);
	}, [committedRoom, chatAttestRoom, chatAttestToken, roomAttest]);

	const applyPresence = useCallback(
		(nextId: string, users: { userId: string; displayName: string; isGuest: boolean }[]) => {
			selfUserIdRef.current = nextId;
			setSelfUserId(nextId);
			setPresence(withYouLabel(nextId, users));
		},
		[],
	);

	const pushHandlers = useMemo<InferSockaPushHandlers<typeof chatContract>>(
		() => ({
			roomMessage: (message: ChatMessageRow) => {
				setMessages((prev) => [...prev, message]);
			},
			presenceUpdated: (presenceUpdate: {
				users: { userId: string; displayName: string; isGuest: boolean }[];
			}) => {
				const self = selfUserIdRef.current;
				if (self === null) {
					setPresence(presenceUpdate.users);
					return;
				}
				setPresence(withYouLabel(self, presenceUpdate.users));
			},
			userJoined: () => {
				void 0;
			},
			userLeft: () => {
				void 0;
			},
			historyCleared: () => {
				setMessages([]);
			},
			messageDeleted: ({ id }: { id: string }) => {
				deletedMessageIdsRef.current.add(id);
				setMessages((prev) => prev.filter((message) => message.id !== id));
			},
		}),
		[],
	);

	const { ready, send, status, reconnecting, reconnectAttempt } = useSockaSession(
		chatContract,
		{
			url: wsUrl,
			pushHandlers,
			onOpen: () => {
				markChatPerformance("socket-open");
				setOpenedRoom(committedRoom);
			},
			onClose: (event) => {
				void event;
				setOpenedRoom((current) => (current === committedRoom ? null : current));
			},
		},
		[wsUrl],
	);

	const proposedRoom = sanitizeChatRoomId(roomInput);
	const joinIsRedundant = proposedRoom === committedRoom;
	const roomInputInvalid = roomInput.trim().length > 0 && !isChatRoomIdInputValid(roomInput);
	const connectionReady = ready && openedRoom === committedRoom;
	const canSwitchRoom = connectionReady && !joinPending && !joinIsRedundant && !roomInputInvalid;

	const updateStuckToBottom = useCallback(() => {
		const element = messageListRef.current;
		if (!element) {
			return;
		}
		const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
		stuckToBottomRef.current = distanceToBottom <= BOTTOM_STICKY_PX;
	}, []);

	const loadInitial = useCallback(async () => {
		stuckToBottomRef.current = true;
		markChatPerformance("initial-load-start");
		const canUseLoaderHistory =
			committedRoom === chatAttestRoom && initialHistoryStatus !== "error";
		const historyPromise = canUseLoaderHistory
			? Promise.resolve()
			: send.listHistory({ limit: 200 }).then(({ messages: history }) => {
					markChatPerformance("history-fallback-loaded");
					setMessages((current) => mergeMessages(history, current, deletedMessageIdsRef.current));
				});
		const presencePromise = send.listPresence({}).then(({ selfUserId, users }) => {
			markChatPerformance("presence-loaded");
			applyPresence(selfUserId, users);
		});
		await Promise.all([historyPromise, presencePromise]);
		markChatPerformance("initial-load-complete");
		measureChatPerformance("initial-load", "initial-load-start", "initial-load-complete");
	}, [send, applyPresence, committedRoom, chatAttestRoom, initialHistoryStatus]);

	const applyInitialMessages = useCallback(
		(history: ChatMessageRow[]) => {
			setInitialHistoryStatus("ready");
			markChatPerformance("initial-history-state-applied");
			if (committedRoom !== chatAttestRoom) {
				return;
			}
			stuckToBottomRef.current = true;
			setMessages((current) => mergeMessages(history, current, deletedMessageIdsRef.current));
		},
		[committedRoom, chatAttestRoom],
	);

	const markInitialHistoryError = useCallback(() => {
		setInitialHistoryStatus("error");
	}, []);

	useEffect(() => {
		if (initialMessagesRef.current === initialMessages) {
			return;
		}
		initialMessagesRef.current = initialMessages;
		setInitialHistoryStatus("pending");
	}, [initialMessages]);

	useEffect(() => {
		if (!didRunRoomResetRef.current) {
			didRunRoomResetRef.current = true;
			return;
		}
		setMessages([]);
		setPresence([]);
		setSelfUserId(null);
		setSocketError(null);
		setInitialHistoryStatus("pending");
		selfUserIdRef.current = null;
		deletedMessageIdsRef.current = new Set();
		stuckToBottomRef.current = true;
		setOpenedRoom((current) => (current === committedRoom ? null : current));
	}, [committedRoom]);

	useEffect(() => {
		if (!connectionReady) {
			return;
		}
		void loadInitial().catch(() => {
			setSocketError("Could not load chat room state. Try reconnecting.");
		});
	}, [connectionReady, loadInitial]);

	/** After history or a new `roomMessage` render: snap to real bottom if pinned, or the latest row is your own. */
	useLayoutEffect(() => {
		if (messages.length === 0) {
			return;
		}
		const element = messageListRef.current;
		if (!element) {
			return;
		}
		const lastMessage = messages[messages.length - 1];
		const isOwn = selfUserId != null && lastMessage.userId === selfUserId;
		if (!stuckToBottomRef.current && !isOwn) {
			return;
		}
		element.scrollTop = element.scrollHeight;
		updateStuckToBottom();
	}, [messages, selfUserId, updateStuckToBottom]);

	/** `rawRoom` is the value from the Room field (state or input element). */
	const applyJoin = useCallback(
		async (rawRoom: string) => {
			const next = sanitizeChatRoomId(rawRoom);
			if (next === committedRoom) {
				return;
			}
			const label = nameDraft.trim() || profileName;
			setNameDraft(label);
			setJoinPending(true);
			let attest: { room: string; token: string } | null = null;
			try {
				attest = await mintChatAttestToken(next);
			} catch {
				attest = null;
			}
			setRoomAttest(attest);
			setCommittedRoom(next);
			setRoomInput(next);
			const params: Record<string, string> = {};
			if (next !== "lobby") {
				params["room"] = next;
			}
			setSearchParams(params);
			setJoinPending(false);
		},
		[nameDraft, committedRoom, profileName, setSearchParams],
	);

	const applyDisplayName = useCallback(() => {
		const displayName = nameDraft.trim();
		if (!displayName || !connectionReady) {
			return;
		}
		pendingSockaDisplayName.current = displayName;
		saveNameFetcher.submit({ intent: "saveDisplayName", displayName }, { method: "post" });
	}, [nameDraft, connectionReady, saveNameFetcher]);

	useEffect(() => {
		if (saveNameFetcher.state !== "idle") {
			return;
		}
		const pending = pendingSockaDisplayName.current;
		const data = saveNameFetcher.data;
		if (!pending || !data) {
			return;
		}
		if (!data.success) {
			pendingSockaDisplayName.current = null;
			return;
		}
		pendingSockaDisplayName.current = null;
		const saved = data.result.displayName;
		void send
			.setDisplayName({ displayName: saved })
			.then(() => {
				nameFieldSnap.current = saved;
				setNameDraft(saved);
			})
			.catch(() => {
				setSocketError("Could not update your chat display name. Try reconnecting.");
			});
	}, [saveNameFetcher.state, saveNameFetcher.data, send]);

	const revertDisplayName = useCallback(() => {
		setNameDraft(nameFieldSnap.current);
	}, []);

	const requestDeleteMessage = useCallback(
		(messageId: string) => {
			if (!window.confirm("Delete this message for everyone in the room? This cannot be undone.")) {
				return;
			}
			deleteMessageFetcher.submit(
				{ intent: "deleteMessage", messageId, room: committedRoom },
				{ method: "post" },
			);
		},
		[committedRoom, deleteMessageFetcher],
	);

	const deleteBusy = deleteMessageFetcher.state !== "idle";
	const deleteError =
		deleteMessageFetcher.state === "idle" &&
		deleteMessageFetcher.data &&
		!deleteMessageFetcher.data.success
			? deleteMessageFetcher.data.error
			: undefined;

	const onRoomChange = useCallback((value: string) => {
		setRoomInput(normalizeChatRoomIdInput(value));
	}, []);

	const onRoomKeyDown = useCallback(
		(event: ReactKeyboardEvent<HTMLInputElement>) => {
			if (event.key === "Escape" && !event.nativeEvent.isComposing) {
				event.preventDefault();
				setRoomInput(committedRoom);
				return;
			}
			if (event.key === "Enter" && !event.nativeEvent.isComposing) {
				event.preventDefault();
				if (connectionReady) {
					void applyJoin(event.currentTarget.value);
				}
			}
		},
		[applyJoin, committedRoom, connectionReady],
	);

	useEffect(() => {
		const fromUrl = roomFromQueryParams(searchParams);
		setRoomInput(fromUrl);
		setCommittedRoom(fromUrl);
	}, [searchParams]);

	const presenceSummary =
		presence.length > 0
			? presence.map((presenceUser) => presenceUser.displayName).join(", ")
			: null;
	const connectionLabel = connectionReady
		? joinPending
			? "Preparing room"
			: "Connected"
		: reconnecting
			? `Reconnecting ${reconnectAttempt}`
			: `Connecting (${status})`;
	const toolbar: ChatViewToolbarProps = {
		nameDraft,
		ready: connectionReady,
		roomInput,
		committedRoom,
		canSwitchRoom,
		roomInputInvalid,
		joinIsRedundant,
		onNameChange: setNameDraft,
		onSaveName: () => {
			void applyDisplayName();
		},
		onRevertName: revertDisplayName,
		onBeginEditName: () => {
			nameFieldSnap.current = nameDraft;
		},
		onRoomChange,
		onRoomKeyDown,
		onJoin: () => {
			void applyJoin(roomInput);
		},
	};
	const handleMessageSubmit = useCallback(
		(text: string) => {
			if (!connectionReady) {
				return;
			}
			setSocketError(null);
			void send.sendMessage({ text }).catch(() => {
				setSocketError("Could not send that message. Try reconnecting.");
			});
		},
		[connectionReady, send],
	);

	return (
		<ChatView
			user={user}
			sessionExpiresAt={sessionExpiresAt}
			guestRetentionDays={guestRetentionDays}
			status={connectionLabel}
			room={committedRoom}
			presenceSummary={presenceSummary}
			saveNameError={saveNameError}
			deleteError={deleteError}
			socketError={socketError}
			canModerate={canModerate}
			toolbar={toolbar}
			messageListRef={messageListRef}
			onMessageListScroll={updateStuckToBottom}
			sendDisabled={!connectionReady}
			onMessageSubmit={handleMessageSubmit}
		>
			<ChatLiveMessages
				committedRoom={committedRoom}
				chatAttestRoom={chatAttestRoom}
				initialHistoryStatus={initialHistoryStatus}
				initialMessages={initialMessages}
				messages={messages}
				canModerate={canModerate}
				deleteBusy={deleteBusy}
				onInitialHistoryError={markInitialHistoryError}
				onInitialHistoryResolve={applyInitialMessages}
				onDeleteMessage={requestDeleteMessage}
			/>
		</ChatView>
	);
}
