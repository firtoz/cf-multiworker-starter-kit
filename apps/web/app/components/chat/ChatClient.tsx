import type { InferSockaPushHandlers } from "@firtoz/socka";
import { useSockaSession } from "@firtoz/socka/react";
import {
	type AuthUser,
	accountDisplayName,
	hasAccountDisplayName,
	waitForBrowserSession,
} from "@internal/auth-client";
import { type ChatMessageRow, chatContract } from "@internal/chat-contract";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { href, Link, useFetcher, useSearchParams } from "react-router";
import { ChatConnectingShell } from "~/components/chat/ChatConnectingShell";
import {
	type ChatDiagnosticEntry,
	ChatDiagnosticsPanel,
} from "~/components/chat/ChatDiagnosticsPanel";
import { ChatGuestRetentionNotice } from "~/components/chat/ChatGuestRetentionNotice";
import { ChatMessageItem } from "~/components/chat/ChatMessageItem";
import { ChatRoomToolbar } from "~/components/chat/ChatRoomToolbar";
import {
	buildChatWsUrl,
	isChatRoomIdInputValid,
	normalizeChatRoomIdInput,
	roomFromQueryParams,
	sanitizeChatRoomId,
} from "~/lib/chat-ws-url";

type PresenceLine = { userId: string; displayName: string; isGuest: boolean };
type DiagnosticProbeMode = "auth-fallback" | "attest";
type ChatAttestResponse = { ok: true; room: string; token: string } | { ok: false; error: string };

/** Message list keeps at least this height; shorter viewports scroll the page instead. */
const CHAT_MESSAGE_LIST_MIN_H_CLASS = "min-h-[150px]" as const;

/** Treat as pinned when within a few CSS px of the true bottom (avoids subpixel / rounding drift). */
const BOTTOM_STICKY_PX = 4;

function nowMs(): number {
	return typeof performance === "undefined" ? Date.now() : performance.now();
}

function postDiagnosticMark(payload: {
	label: string;
	room: string;
	cid: string;
	atMs: number;
	deltaMs: number;
	details?: ChatDiagnosticEntry["details"];
}): void {
	const body = JSON.stringify({
		...payload,
		clientEpochMs: Date.now(),
		performanceTimeOrigin:
			typeof performance === "undefined" ? undefined : Math.round(performance.timeOrigin),
		pageUrl: window.location.href,
	});
	void fetch(`/api/chat/diag?diag=1&beacon=${Date.now()}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body,
		keepalive: body.length < 60_000,
	}).catch(() => undefined);
}

function createConnectionId(room: string): string {
	const suffix =
		typeof crypto !== "undefined" && "randomUUID" in crypto
			? crypto.randomUUID()
			: `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	return `${room}-${suffix}`;
}

async function mintChatAttestToken(
	room: string,
	cid: string,
): Promise<{ room: string; token: string }> {
	const response = await fetch("/api/chat/attest?diag=1", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ room, cid }),
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

function formatSessionExpiry(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) {
		return iso;
	}
	return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

type ChatClientProps = {
	user: AuthUser;
	sessionExpiresAt: string;
	guestRetentionDays: number;
	pendingAuthCookies: boolean;
	chatAttestToken: string;
	chatAttestRoom: string;
	canModerate: boolean;
	saveNameError?: string;
};

/** Wait until HttpOnly auth cookies from the loader are visible to the browser before opening Socka. */
export function ChatClient(props: ChatClientProps) {
	const [browserReady, setBrowserReady] = useState(false);
	const [wsConnectReady, setWsConnectReady] = useState(!props.pendingAuthCookies);
	const diagnosticEnabled =
		typeof window !== "undefined" &&
		new URLSearchParams(window.location.search).get("diag") === "1";
	const displayName = accountDisplayName(props.user) ?? "Guest";
	const room = props.chatAttestRoom;

	useEffect(() => {
		setBrowserReady(true);
	}, []);

	useEffect(() => {
		if (diagnosticEnabled) {
			console.info("chat:diag:client-mounted", {
				pendingAuthCookies: props.pendingAuthCookies,
				wsConnectReady,
				atMs: nowMs(),
			});
		}
	}, [diagnosticEnabled, props.pendingAuthCookies, wsConnectReady]);

	useEffect(() => {
		if (!props.pendingAuthCookies) {
			return;
		}
		let cancelled = false;
		void (async () => {
			const startedAt = nowMs();
			if (diagnosticEnabled) {
				console.info("chat:diag:wait-browser-session:start", { atMs: startedAt });
			}
			if (!cancelled && (await waitForBrowserSession())) {
				if (diagnosticEnabled) {
					console.info("chat:diag:wait-browser-session:done", {
						elapsedMs: nowMs() - startedAt,
					});
				}
				setWsConnectReady(true);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [diagnosticEnabled, props.pendingAuthCookies]);

	if (!browserReady) {
		return <ChatConnectingShell displayName={displayName} room={room} status="Preparing chat" />;
	}

	if (!wsConnectReady) {
		return <ChatConnectingShell displayName={displayName} room={room} status="Starting session" />;
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
	const diagnosticEnabled = searchParams.get("diag") === "1";
	const diagnosticBaseAtRef = useRef(nowMs());
	const diagnosticLastAtRef = useRef(diagnosticBaseAtRef.current);
	const diagnosticIdRef = useRef(0);
	const [diagnosticEntries, setDiagnosticEntries] = useState<ChatDiagnosticEntry[]>([]);
	const [diagnosticConnection, setDiagnosticConnection] = useState<{
		room: string;
		cid: string;
	} | null>(null);
	const [diagnosticAttest, setDiagnosticAttest] = useState<{
		room: string;
		token: string;
		source: "join" | "probe";
	} | null>(null);
	const probeRef = useRef<{
		room: string;
		text: string;
		startedAt: number;
		mode: DiagnosticProbeMode;
		connectedAt?: number;
		sentAt?: number;
		waitingForOpen: boolean;
	} | null>(null);
	const [probeRunning, setProbeRunning] = useState(false);
	const [joinPending, setJoinPending] = useState(false);
	const [openedConnectionId, setOpenedConnectionId] = useState<string | null>(null);
	/** `useLayoutEffect` needs self in deps; ref alone can lag behind first `messages` paint. */
	const [selfUserId, setSelfUserId] = useState<string | null>(null);
	const selfUserIdRef = useRef<string | null>(null);
	const messageListRef = useRef<HTMLUListElement | null>(null);
	/** True if the user is at (or we just snapped to) the true bottom. */
	const stuckToBottomRef = useRef(true);
	/** Revert name field on blur/Esc to what it was on last focus. */
	const nameFieldSnap = useRef(nameDraft);
	const connectionStartedAtRef = useRef(Date.now());

	const connectionId = useMemo(
		() =>
			diagnosticConnection?.room === committedRoom
				? diagnosticConnection.cid
				: createConnectionId(committedRoom),
		[committedRoom, diagnosticConnection],
	);
	const wsUrl = useMemo(() => {
		const token =
			committedRoom === chatAttestRoom
				? chatAttestToken
				: diagnosticAttest?.room === committedRoom
					? diagnosticAttest.token
					: undefined;
		return buildChatWsUrl(committedRoom, token, connectionId);
	}, [committedRoom, chatAttestRoom, chatAttestToken, connectionId, diagnosticAttest]);

	const addDiagnosticMark = useCallback(
		(label: string, details?: ChatDiagnosticEntry["details"]) => {
			if (!diagnosticEnabled) {
				return;
			}
			const atMs = nowMs();
			const deltaMs = atMs - diagnosticLastAtRef.current;
			diagnosticLastAtRef.current = atMs;
			const entry: ChatDiagnosticEntry = {
				id: ++diagnosticIdRef.current,
				label,
				atMs: atMs - diagnosticBaseAtRef.current,
				deltaMs,
				...(details === undefined ? {} : { details }),
			};
			console.info("chat:diag", {
				label,
				atMs: Math.round(entry.atMs),
				deltaMs: Math.round(deltaMs),
				...details,
			});
			postDiagnosticMark({
				label,
				room: typeof details?.["room"] === "string" ? details["room"] : committedRoom,
				cid: typeof details?.["cid"] === "string" ? details["cid"] : connectionId,
				atMs: entry.atMs,
				deltaMs,
				details,
			});
			setDiagnosticEntries((prev) => [...prev.slice(-79), entry]);
		},
		[committedRoom, connectionId, diagnosticEnabled],
	);

	useEffect(() => {
		addDiagnosticMark("socket-component-mounted", {
			room: committedRoom,
			hasAttest: committedRoom === chatAttestRoom || diagnosticAttest?.room === committedRoom,
			attestSource:
				committedRoom === chatAttestRoom
					? "loader"
					: diagnosticAttest?.room === committedRoom
						? diagnosticAttest.source
						: "none",
		});
	}, [addDiagnosticMark, chatAttestRoom, committedRoom, diagnosticAttest]);

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
				addDiagnosticMark("websocket-open", {
					room: committedRoom,
					cid: connectionId,
					elapsedMs: Date.now() - connectionStartedAtRef.current,
				});
				setOpenedConnectionId(connectionId);
				const probe = probeRef.current;
				if (probe && probe.room === committedRoom) {
					probe.waitingForOpen = false;
				}
				console.info("chat:ws:open", {
					room: committedRoom,
					cid: connectionId,
					elapsedMs: Date.now() - connectionStartedAtRef.current,
					url: wsUrl,
				});
			},
			onClose: (event) => {
				addDiagnosticMark("websocket-close", {
					room: committedRoom,
					code: event.code,
					wasClean: event.wasClean,
				});
				setOpenedConnectionId((current) => (current === connectionId ? null : current));
				console.warn("chat:ws:close", {
					room: committedRoom,
					cid: connectionId,
					url: wsUrl,
					code: event.code,
					reason: event.reason,
					wasClean: event.wasClean,
					elapsedMs: Date.now() - connectionStartedAtRef.current,
				});
			},
			onError: () => {
				addDiagnosticMark("websocket-error", { room: committedRoom, cid: connectionId });
				console.error("chat:ws:error", {
					room: committedRoom,
					cid: connectionId,
					elapsedMs: Date.now() - connectionStartedAtRef.current,
					url: wsUrl,
				});
			},
			onReconnecting: (info) => {
				addDiagnosticMark("websocket-reconnecting", {
					room: committedRoom,
					attempt: info.attempt,
				});
				console.warn("chat:ws:reconnecting", {
					room: committedRoom,
					cid: connectionId,
					elapsedMs: Date.now() - connectionStartedAtRef.current,
					url: wsUrl,
					...info,
				});
			},
			onReconnected: (info) => {
				addDiagnosticMark("websocket-reconnected", {
					room: committedRoom,
					attempt: info.attempt,
				});
				console.info("chat:ws:reconnected", {
					room: committedRoom,
					cid: connectionId,
					elapsedMs: Date.now() - connectionStartedAtRef.current,
					url: wsUrl,
					...info,
				});
			},
			reportError: (event) => {
				addDiagnosticMark("socka-error", { room: committedRoom, cid: connectionId });
				console.error("chat:socka:error", {
					room: committedRoom,
					cid: connectionId,
					elapsedMs: Date.now() - connectionStartedAtRef.current,
					url: wsUrl,
					event,
				});
			},
		},
		[wsUrl, addDiagnosticMark],
	);

	const proposedRoom = sanitizeChatRoomId(roomInput);
	const joinIsRedundant = proposedRoom === committedRoom;
	const roomInputInvalid = roomInput.trim().length > 0 && !isChatRoomIdInputValid(roomInput);
	const connectionReady = ready && openedConnectionId === connectionId;
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
		const historyStartedAt = nowMs();
		addDiagnosticMark("list-history:start", { room: committedRoom });
		const { messages: hist } = await send.listHistory({ limit: 200 });
		addDiagnosticMark("list-history:done", {
			room: committedRoom,
			count: hist.length,
			elapsedMs: Math.round(nowMs() - historyStartedAt),
		});
		setMessages(hist);
		const presenceStartedAt = nowMs();
		addDiagnosticMark("list-presence:start", { room: committedRoom });
		const { selfUserId, users } = await send.listPresence({});
		addDiagnosticMark("list-presence:done", {
			room: committedRoom,
			count: users.length,
			elapsedMs: Math.round(nowMs() - presenceStartedAt),
		});
		applyPresence(selfUserId, users);
	}, [send, applyPresence, addDiagnosticMark, committedRoom]);

	useEffect(() => {
		connectionStartedAtRef.current = Date.now();
		addDiagnosticMark("websocket-init", {
			room: committedRoom,
			cid: connectionId,
			hasAttest: committedRoom === chatAttestRoom || diagnosticAttest?.room === committedRoom,
			attestSource:
				committedRoom === chatAttestRoom
					? "loader"
					: diagnosticAttest?.room === committedRoom
						? diagnosticAttest.source
						: "none",
		});
		console.info("chat:ws:init", { room: committedRoom, cid: connectionId, url: wsUrl });
		setMessages([]);
		setPresence([]);
		setSelfUserId(null);
		selfUserIdRef.current = null;
		stuckToBottomRef.current = true;
		setOpenedConnectionId(null);
	}, [addDiagnosticMark, chatAttestRoom, committedRoom, connectionId, diagnosticAttest, wsUrl]);

	useEffect(() => {
		if (!connectionReady) {
			return;
		}
		addDiagnosticMark("socka-ready", { room: committedRoom, cid: connectionId });
		const probe = probeRef.current;
		if (
			probe &&
			probe.room === committedRoom &&
			probe.connectedAt === undefined &&
			!probe.waitingForOpen
		) {
			probe.connectedAt = nowMs();
			addDiagnosticMark("probe:connected", {
				room: committedRoom,
				mode: probe.mode,
				elapsedMs: Math.round(probe.connectedAt - probe.startedAt),
			});
		}
		void loadInitial();
	}, [connectionReady, loadInitial, addDiagnosticMark, committedRoom, connectionId]);

	useEffect(() => {
		const probe = probeRef.current;
		if (
			!probe ||
			probe.room !== committedRoom ||
			!connectionReady ||
			probe.connectedAt === undefined ||
			probe.sentAt !== undefined
		) {
			return;
		}
		probe.sentAt = nowMs();
		addDiagnosticMark("probe:send:start", {
			room: committedRoom,
			mode: probe.mode,
			elapsedMs: Math.round(probe.sentAt - probe.startedAt),
		});
		void send.sendMessage({ text: probe.text }).catch((error: unknown) => {
			addDiagnosticMark("probe:send:error", {
				room: committedRoom,
				error: error instanceof Error ? error.message : String(error),
			});
			probeRef.current = null;
			setProbeRunning(false);
		});
	}, [addDiagnosticMark, committedRoom, connectionReady, send]);

	useEffect(() => {
		const probe = probeRef.current;
		if (!probe || probe.room !== committedRoom || probe.sentAt === undefined) {
			return;
		}
		const echoed = messages.some((message) => message.text === probe.text);
		if (!echoed) {
			return;
		}
		addDiagnosticMark("probe:echo-seen", {
			room: committedRoom,
			mode: probe.mode,
			totalMs: Math.round(nowMs() - probe.startedAt),
			sendToEchoMs: Math.round(nowMs() - probe.sentAt),
		});
		probeRef.current = null;
		setProbeRunning(false);
	}, [addDiagnosticMark, committedRoom, messages]);

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
			const cid = createConnectionId(next);
			const label = nameDraft.trim() || profileName;
			setNameDraft(label);
			setJoinPending(true);
			addDiagnosticMark("join:attest-token:start", { room: next, cid });
			let attest: { room: string; token: string } | null = null;
			try {
				const tokenStartedAt = nowMs();
				attest = await mintChatAttestToken(next, cid);
				addDiagnosticMark("join:attest-token:done", {
					room: next,
					cid,
					elapsedMs: Math.round(nowMs() - tokenStartedAt),
				});
			} catch (error: unknown) {
				addDiagnosticMark("join:attest-token:error", {
					room: next,
					cid,
					error: error instanceof Error ? error.message : String(error),
				});
			}
			setDiagnosticConnection({ room: next, cid });
			setDiagnosticAttest(
				attest ? { room: attest.room, token: attest.token, source: "join" } : null,
			);
			setCommittedRoom(next);
			setRoomInput(next);
			const params: Record<string, string> = {};
			if (next !== "lobby") {
				params["room"] = next;
			}
			setSearchParams(params);
			setJoinPending(false);
		},
		[addDiagnosticMark, nameDraft, committedRoom, profileName, setSearchParams],
	);

	const runDiagnosticProbe = useCallback(
		(mode: DiagnosticProbeMode) => {
			if (probeRunning) {
				return;
			}
			const room = sanitizeChatRoomId(`diag-${Date.now().toString(36)}`);
			const cid = createConnectionId(room);
			const text = `diag probe ${room} ${new Date().toISOString()}`;
			const startedAt = nowMs();
			probeRef.current = { room, text, startedAt, mode, waitingForOpen: true };
			setProbeRunning(true);
			setDiagnosticConnection({ room, cid });
			addDiagnosticMark("probe:start", { room, cid, mode });
			setNameDraft(nameDraft.trim() || profileName);
			if (mode === "auth-fallback") {
				setDiagnosticAttest(null);
				setRoomInput(room);
				setCommittedRoom(room);
				return;
			}
			const tokenStartedAt = nowMs();
			addDiagnosticMark("probe:attest-token:start", { room, cid, mode });
			void mintChatAttestToken(room, cid)
				.then((payload) => {
					addDiagnosticMark("probe:attest-token:done", {
						room,
						cid,
						mode,
						elapsedMs: Math.round(nowMs() - tokenStartedAt),
					});
					setDiagnosticAttest({ room: payload.room, token: payload.token, source: "probe" });
					setRoomInput(room);
					setCommittedRoom(room);
				})
				.catch((error: unknown) => {
					addDiagnosticMark("probe:attest-token:error", {
						room,
						cid,
						mode,
						error: error instanceof Error ? error.message : String(error),
					});
					probeRef.current = null;
					setProbeRunning(false);
				});
		},
		[addDiagnosticMark, nameDraft, probeRunning, profileName],
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
		void send.setDisplayName({ displayName: saved }).then(() => {
			nameFieldSnap.current = saved;
			setNameDraft(saved);
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

	const sessionExpiryLabel = formatSessionExpiry(sessionExpiresAt);
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
						sessionExpiresAt={sessionExpiryLabel}
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
				{diagnosticEnabled ? (
					<ChatDiagnosticsPanel
						entries={diagnosticEntries}
						probeRunning={probeRunning}
						onRunProbe={runDiagnosticProbe}
					/>
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
						void send.sendMessage({ text });
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
