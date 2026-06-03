import type { InferSockaPushHandlers } from "@firtoz/socka";
import { useSockaSession } from "@firtoz/socka/react";
import { waitForBrowserSession } from "@internal/auth-client/browser-client";
import { accountDisplayName, hasAccountDisplayName } from "@internal/auth-client/display-name";
import type { AuthUser } from "@internal/auth-client/roles";
import { type ChatMessageRow, chatContract } from "@internal/chat-contract";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	Suspense,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Await, href, Link, useFetcher, useSearchParams } from "react-router";
import { ChatGuestRetentionNotice } from "~/components/chat/ChatGuestRetentionNotice";
import { ChatInitialHistoryError } from "~/components/chat/ChatInitialHistoryError";
import { ChatInitialHistoryResolved } from "~/components/chat/ChatInitialHistoryResolved";
import { ChatMessageItem } from "~/components/chat/ChatMessageItem";
import { ChatRoomToolbar } from "~/components/chat/ChatRoomToolbar";
import { ChatServerShell } from "~/components/chat/ChatServerShell";
import { LocalDateTime } from "~/components/shared/LocalDateTime";
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

/** Message list keeps at least this height; shorter viewports scroll the page instead. */
const CHAT_MESSAGE_LIST_MIN_H_CLASS = "min-h-[150px]" as const;

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
	return users.map((u) => ({
		...u,
		displayName: u.userId === selfUserId ? `${u.displayName} (you)` : u.displayName,
	}));
}

type ChatClientProps = {
	user: AuthUser;
	sessionExpiresAt: string;
	guestRetentionDays: number;
	pendingAuthCookies: boolean;
	chatAttestToken: string;
	chatAttestRoom: string;
	initialMessages: Promise<ChatMessageRow[]>;
	canModerate: boolean;
	saveNameError?: string;
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

	if (!browserReady) {
		return (
			<ChatServerShell
				user={props.user}
				sessionExpiresAt={props.sessionExpiresAt}
				guestRetentionDays={props.guestRetentionDays}
				room={room}
				status="Preparing chat"
				initialMessages={props.initialMessages}
				canModerate={props.canModerate}
				{...(props.saveNameError === undefined ? {} : { saveNameError: props.saveNameError })}
			/>
		);
	}

	if (!wsConnectReady) {
		return (
			<ChatServerShell
				user={props.user}
				sessionExpiresAt={props.sessionExpiresAt}
				guestRetentionDays={props.guestRetentionDays}
				room={room}
				status="Starting session"
				initialMessages={props.initialMessages}
				canModerate={props.canModerate}
				{...(props.saveNameError === undefined ? {} : { saveNameError: props.saveNameError })}
			/>
		);
	}

	return <ChatClientWithSocket {...props} />;
}

function ChatClientWithSocket({
	user,
	sessionExpiresAt,
	guestRetentionDays,
	saveNameError,
	chatAttestToken,
	chatAttestRoom,
	initialMessages,
	canModerate,
}: Omit<ChatClientProps, "pendingAuthCookies">) {
	const isAnonymousGuest = user.isAnonymous === true;
	const usesAccountName = !isAnonymousGuest && hasAccountDisplayName(user);
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
			roomMessage: (m: ChatMessageRow) => {
				setMessages((prev) => [...prev, m]);
			},
			presenceUpdated: (p: {
				users: { userId: string; displayName: string; isGuest: boolean }[];
			}) => {
				const self = selfUserIdRef.current;
				if (self === null) {
					setPresence(p.users);
					return;
				}
				setPresence(withYouLabel(self, p.users));
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
				setMessages((prev) => prev.filter((m) => m.id !== id));
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
		const el = messageListRef.current;
		if (!el) {
			return;
		}
		const d = el.scrollHeight - el.scrollTop - el.clientHeight;
		stuckToBottomRef.current = d <= BOTTOM_STICKY_PX;
	}, []);

	const loadInitial = useCallback(async () => {
		stuckToBottomRef.current = true;
		markChatPerformance("initial-load-start");
		const canUseLoaderHistory =
			committedRoom === chatAttestRoom && initialHistoryStatus !== "error";
		const historyPromise = canUseLoaderHistory
			? Promise.resolve()
			: send.listHistory({ limit: 200 }).then(({ messages: hist }) => {
					markChatPerformance("history-fallback-loaded");
					setMessages((current) => mergeMessages(hist, current, deletedMessageIdsRef.current));
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
		const el = messageListRef.current;
		if (!el) {
			return;
		}
		const last = messages[messages.length - 1];
		const isOwn = selfUserId != null && last.userId === selfUserId;
		if (!stuckToBottomRef.current && !isOwn) {
			return;
		}
		el.scrollTop = el.scrollHeight;
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
		const t = nameDraft.trim();
		if (!t || !connectionReady) {
			return;
		}
		pendingSockaDisplayName.current = t;
		saveNameFetcher.submit({ intent: "saveDisplayName", displayName: t }, { method: "post" });
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

	const onRoomKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Escape" && !e.nativeEvent.isComposing) {
			e.preventDefault();
			setRoomInput(committedRoom);
			return;
		}
		if (e.key === "Enter" && !e.nativeEvent.isComposing) {
			e.preventDefault();
			if (connectionReady) {
				void applyJoin(e.currentTarget.value);
			}
		}
	};

	useEffect(() => {
		const fromUrl = roomFromQueryParams(searchParams);
		setRoomInput(fromUrl);
		setCommittedRoom(fromUrl);
	}, [searchParams]);

	const presenceSummary =
		presence.length > 0 ? presence.map((u) => u.displayName).join(", ") : null;
	const connectionLabel = connectionReady
		? joinPending
			? "Preparing room"
			: "Connected"
		: reconnecting
			? `Reconnecting ${reconnectAttempt}`
			: `Connecting (${status})`;

	return (
		<div className="max-w-2xl mx-auto w-full min-h-full flex flex-col gap-2 px-4 py-2 sm:gap-3 sm:py-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
			<header className="shrink-0 space-y-2">
				<div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
					<h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">Chat</h1>
					<p className="text-xs text-gray-500 min-w-0 text-right">
						{connectionLabel} · <span className="font-mono">{committedRoom}</span>
						{presenceSummary ? (
							<>
								<span className="hidden sm:inline"> · Online: </span>
								<span className="sm:hidden"> · </span>
								<span className="text-gray-600 dark:text-gray-400">{presenceSummary}</span>
							</>
						) : null}
					</p>
				</div>
				<p className="hidden md:block text-sm text-gray-600 dark:text-gray-400">
					Group chat with one conversation per room. The default is{" "}
					<code className="font-mono">lobby</code>.{" "}
					{usesAccountName ? (
						<>Click your display name in the toolbar to change it.</>
					) : (
						<>
							Guest names appear faded;{" "}
							<Link
								className="text-blue-600 dark:text-blue-400 underline"
								to={href("/guest/upgrade")}
							>
								create an account
							</Link>{" "}
							to keep your name and history permanently.
						</>
					)}
				</p>
				{isAnonymousGuest ? (
					<ChatGuestRetentionNotice
						guestRetentionDays={guestRetentionDays}
						sessionExpiresAt={<LocalDateTime value={sessionExpiresAt} />}
					/>
				) : null}
				{!isAnonymousGuest && !usesAccountName ? (
					<p className="hidden sm:block text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
						Set a display name below or on{" "}
						<Link className="underline font-medium" to={href("/account")}>
							your account
						</Link>
						.
					</p>
				) : null}
				{saveNameError ? (
					<p className="text-sm text-red-700 dark:text-red-300">{saveNameError}</p>
				) : null}
				{canModerate ? (
					<p className="text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
						Admin moderation: use Delete on any message (you will be asked to confirm).
					</p>
				) : null}
				{deleteError ? (
					<p className="text-sm text-red-700 dark:text-red-300">{deleteError}</p>
				) : null}
				{socketError ? (
					<p className="text-sm text-red-700 dark:text-red-300">{socketError}</p>
				) : null}
			</header>

			<div className="sticky top-0 z-10 shrink-0 -mx-4 border-b border-gray-200 bg-white/95 px-4 py-2 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-950/95">
				<ChatRoomToolbar
					nameDraft={nameDraft}
					isGuest={isAnonymousGuest}
					ready={connectionReady}
					roomInput={roomInput}
					committedRoom={committedRoom}
					canSwitchRoom={canSwitchRoom}
					roomInputInvalid={roomInputInvalid}
					joinIsRedundant={joinIsRedundant}
					onNameChange={setNameDraft}
					onSaveName={() => {
						void applyDisplayName();
					}}
					onRevertName={revertDisplayName}
					onBeginEditName={() => {
						nameFieldSnap.current = nameDraft;
					}}
					onRoomChange={onRoomChange}
					onRoomKeyDown={onRoomKeyDown}
					onJoin={() => {
						void applyJoin(roomInput);
					}}
				/>
			</div>

			<div className={`flex-1 flex flex-col ${CHAT_MESSAGE_LIST_MIN_H_CLASS}`}>
				<ul
					ref={messageListRef}
					className="flex min-h-0 flex-1 flex-col list-none gap-2 overflow-y-auto overscroll-contain border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-900/50"
					aria-label="Message history"
					onScroll={updateStuckToBottom}
				>
					{committedRoom === chatAttestRoom && initialHistoryStatus === "pending" ? (
						<Suspense
							fallback={
								messages.length === 0 ? (
									<li className="text-sm text-gray-500">Loading message history…</li>
								) : null
							}
						>
							<Await
								resolve={initialMessages}
								errorElement={<ChatInitialHistoryError onError={markInitialHistoryError} />}
							>
								{(history) => (
									<ChatInitialHistoryResolved messages={history} onResolve={applyInitialMessages} />
								)}
							</Await>
						</Suspense>
					) : null}
					{messages.map((m) => (
						<ChatMessageItem
							key={m.id}
							message={m}
							canModerate={canModerate}
							deleteBusy={deleteBusy}
							onDelete={requestDeleteMessage}
						/>
					))}
				</ul>
			</div>

			<footer className="shrink-0 border-t border-gray-200 dark:border-gray-700 pt-2">
				<form
					className="flex gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						const fd = new FormData(e.currentTarget);
						const text = String(fd.get("text") ?? "").trim();
						if (!text || !connectionReady) {
							return;
						}
						setSocketError(null);
						void send.sendMessage({ text }).catch(() => {
							setSocketError("Could not send that message. Try reconnecting.");
						});
						e.currentTarget.reset();
					}}
				>
					<input
						name="text"
						className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 sm:px-3 py-1.5 sm:py-2 bg-white dark:bg-gray-900 text-sm"
						placeholder="Message…"
						autoComplete="off"
					/>
					<button
						type="submit"
						disabled={!connectionReady}
						className="shrink-0 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm"
					>
						Send
					</button>
				</form>
			</footer>
		</div>
	);
}
