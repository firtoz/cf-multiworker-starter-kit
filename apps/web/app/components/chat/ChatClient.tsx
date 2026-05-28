import type { InferSockaPushHandlers } from "@firtoz/socka";
import { useSockaSession } from "@firtoz/socka/react";
import {
	AUTH_GET_SESSION_PATH,
	type AuthUser,
	accountDisplayName,
	hasAccountDisplayName,
} from "@internal/auth-client";
import { type ChatMessageRow, chatContract } from "@internal/chat-contract";
import type { FocusEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { href, Link, useFetcher, useSearchParams } from "react-router";
import { chatAuthorNameClassName } from "~/components/chat/chat-display-name-styles";
import { BackToHomeLink } from "~/components/shared/BackToHomeLink";
import { buildChatWsUrl, sanitizeChatRoomId } from "~/lib/chat-ws-url";

type PresenceLine = { userId: string; displayName: string; isGuest: boolean };

/** Treat as pinned when within a few CSS px of the true bottom (avoids subpixel / rounding drift). */
const BOTTOM_STICKY_PX = 4;

function roomFromQueryParams(sp: { get: (key: "room") => string | null }): string {
	const r = sp.get("room");
	return r ? sanitizeChatRoomId(r) : "lobby";
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
	saveNameError?: string;
};

/** Wait until HttpOnly auth cookies from the loader are visible to the browser before opening Socka. */
export function ChatClient(props: ChatClientProps) {
	const [wsConnectReady, setWsConnectReady] = useState(!props.pendingAuthCookies);

	useEffect(() => {
		if (!props.pendingAuthCookies) {
			return;
		}
		let cancelled = false;
		const waitForBrowserSession = async () => {
			for (let attempt = 0; attempt < 40 && !cancelled; attempt++) {
				try {
					const res = await fetch(AUTH_GET_SESSION_PATH, { credentials: "include" });
					if (res.ok) {
						const body = (await res.json()) as { user?: unknown; session?: unknown };
						if (body.user && body.session) {
							setWsConnectReady(true);
							return;
						}
					}
				} catch {
					// retry
				}
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
		};
		void waitForBrowserSession();
		return () => {
			cancelled = true;
		};
	}, [props.pendingAuthCookies]);

	if (!wsConnectReady) {
		return (
			<div className="max-w-2xl mx-auto w-full h-dvh max-h-dvh min-h-0 flex flex-col gap-4 overflow-hidden px-4 py-4">
				<BackToHomeLink />
				<h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Chat</h1>
				<p className="text-sm text-gray-600 dark:text-gray-400">Starting session…</p>
			</div>
		);
	}

	return <ChatClientWithSocket {...props} />;
}

function ChatClientWithSocket({
	user,
	sessionExpiresAt,
	guestRetentionDays,
	saveNameError,
}: Omit<ChatClientProps, "pendingAuthCookies">) {
	const isAnonymousGuest = user.isAnonymous === true;
	const usesAccountName = !isAnonymousGuest && hasAccountDisplayName(user);
	const saveNameFetcher = useFetcher<
		| { success: true; result: { displayName: string } }
		| { success: false; error: string }
		| undefined
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
	/** `useLayoutEffect` needs self in deps; ref alone can lag behind first `messages` paint. */
	const [selfUserId, setSelfUserId] = useState<string | null>(null);
	const selfUserIdRef = useRef<string | null>(null);
	const messageListRef = useRef<HTMLUListElement | null>(null);
	/** True if the user is at (or we just snapped to) the true bottom. */
	const stuckToBottomRef = useRef(true);
	/** Revert name field on blur/Esc to what it was on last focus. */
	const nameFieldSnap = useRef(nameDraft);

	const proposedRoom = sanitizeChatRoomId(roomInput);
	const joinIsRedundant = proposedRoom === committedRoom;
	const wsUrl = useMemo(() => buildChatWsUrl(committedRoom), [committedRoom]);

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
		}),
		[],
	);

	const { ready, send } = useSockaSession(chatContract, { url: wsUrl, pushHandlers }, [wsUrl]);

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
		const { messages: hist } = await send.listHistory({ limit: 200 });
		setMessages(hist);
		const { selfUserId, users } = await send.listPresence({});
		applyPresence(selfUserId, users);
	}, [send, applyPresence]);

	useEffect(() => {
		if (!ready) {
			return;
		}
		void loadInitial();
	}, [ready, loadInitial]);

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
		(rawRoom: string) => {
			const next = sanitizeChatRoomId(rawRoom);
			if (next === committedRoom) {
				return;
			}
			const label = nameDraft.trim() || profileName;
			setNameDraft(label);
			setCommittedRoom(next);
			setRoomInput(next);
			const params: Record<string, string> = {};
			if (next !== "lobby") {
				params["room"] = next;
			}
			setSearchParams(params);
		},
		[nameDraft, committedRoom, profileName, setSearchParams],
	);

	const applyDisplayName = useCallback(() => {
		const t = nameDraft.trim();
		if (!t || !ready || usesAccountName) {
			return;
		}
		pendingSockaDisplayName.current = t;
		saveNameFetcher.submit({ intent: "saveDisplayName", displayName: t }, { method: "post" });
	}, [nameDraft, ready, saveNameFetcher, usesAccountName]);

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

	/** Revert only when focus is not moving to another control. */
	const onNameBlur = useCallback((e: FocusEvent<HTMLInputElement>) => {
		if (e.relatedTarget != null) {
			return;
		}
		setNameDraft(nameFieldSnap.current);
	}, []);

	const onNameKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Escape" && !e.nativeEvent.isComposing) {
			e.preventDefault();
			setNameDraft(nameFieldSnap.current);
			return;
		}
		if (e.key === "Enter" && !e.nativeEvent.isComposing) {
			e.preventDefault();
			void applyDisplayName();
		}
	};

	const onRoomBlur = useCallback(
		(e: FocusEvent<HTMLInputElement>) => {
			if (e.relatedTarget != null) {
				return;
			}
			setRoomInput(committedRoom);
		},
		[committedRoom],
	);

	const onRoomKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Escape" && !e.nativeEvent.isComposing) {
			e.preventDefault();
			setRoomInput(committedRoom);
			return;
		}
		if (e.key === "Enter" && !e.nativeEvent.isComposing) {
			e.preventDefault();
			if (ready) {
				void applyJoin(e.currentTarget.value);
			}
		}
	};

	useEffect(() => {
		const fromUrl = roomFromQueryParams(searchParams);
		setRoomInput(fromUrl);
		setCommittedRoom(fromUrl);
	}, [searchParams]);

	return (
		<div className="max-w-2xl mx-auto w-full h-dvh max-h-dvh min-h-0 flex flex-col gap-4 overflow-hidden px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
			<header className="shrink-0 space-y-4">
				<BackToHomeLink />
				<h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Chat</h1>
				<p className="text-sm text-gray-600 dark:text-gray-400">
					Group chat with one conversation per room. The default is{" "}
					<code className="font-mono">lobby</code>.{" "}
					{usesAccountName ? (
						<>
							Your name comes from your account. Guest names appear faded; signed-in members are
							shown in full weight.
						</>
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
					<p className="text-sm text-sky-900 dark:text-sky-100 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded-lg px-3 py-2">
						Your guest name and history on this device last{" "}
						<strong>{guestRetentionDays} days</strong> from your last visit. Come back before{" "}
						<strong>{formatSessionExpiry(sessionExpiresAt)}</strong> to keep them, or{" "}
						<Link className="underline font-medium" to={href("/guest/upgrade")}>
							create an account
						</Link>{" "}
						to keep them permanently.
					</p>
				) : null}
				{!isAnonymousGuest && !usesAccountName ? (
					<p className="text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
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
				<div className="flex flex-col sm:flex-row gap-2 sm:items-end">
					<div className="flex-1 flex flex-col gap-1 text-sm min-w-0">
						<span className="text-gray-700 dark:text-gray-300">Display name</span>
						<div className="flex gap-2">
							<input
								className="flex-1 min-w-0 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 disabled:opacity-70"
								value={nameDraft}
								readOnly={usesAccountName}
								disabled={usesAccountName}
								onChange={(e) => setNameDraft(e.target.value)}
								onFocus={(e) => {
									nameFieldSnap.current = e.currentTarget.value;
								}}
								onBlur={onNameBlur}
								onKeyDown={onNameKeyDown}
							/>
							<button
								id="chat-save-name"
								type="button"
								disabled={!ready || usesAccountName}
								className="shrink-0 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-100 font-medium px-3 py-2 rounded-lg disabled:opacity-50"
								onClick={() => {
									void applyDisplayName();
								}}
							>
								Save name
							</button>
						</div>
					</div>
					<label className="flex-1 flex flex-col gap-1 text-sm">
						<span className="text-gray-700 dark:text-gray-300">Room</span>
						<input
							className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 font-mono"
							value={roomInput}
							onChange={(e) => setRoomInput(e.target.value)}
							onBlur={onRoomBlur}
							onKeyDown={onRoomKeyDown}
							placeholder="lobby"
							autoComplete="off"
						/>
					</label>
					<button
						id="chat-join"
						type="button"
						className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed disabled:hover:bg-gray-400 text-white font-medium px-4 py-2 rounded-lg"
						onClick={() => {
							void applyJoin(roomInput);
						}}
						disabled={!ready || joinIsRedundant}
						title={
							joinIsRedundant ? "Already in this room — change the room name to switch" : undefined
						}
					>
						Join
					</button>
				</div>
				<p className="text-xs text-gray-500">
					{ready ? "Connected" : "Connecting…"} · Room:{" "}
					<span className="font-mono">{committedRoom}</span>
				</p>
			</header>

			<div className="flex-1 min-h-0 flex flex-col">
				<ul
					ref={messageListRef}
					className="flex min-h-0 flex-1 flex-col list-none gap-2 overflow-y-auto overscroll-contain border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-900/50"
					aria-label="Message history"
					onScroll={updateStuckToBottom}
				>
					{messages.map((m) => (
						<li key={m.id} className="text-sm wrap-break-word">
							<span className={chatAuthorNameClassName(m.isGuest)}>{m.displayName}</span>
							<span className="text-gray-500 text-xs ml-2">
								{new Date(m.ts).toLocaleTimeString()}
							</span>
							<p className="text-gray-700 dark:text-gray-300 mt-0.5">{m.text}</p>
						</li>
					))}
				</ul>
			</div>

			<footer className="shrink-0 space-y-3 border-t border-gray-200 dark:border-gray-700 pt-3">
				{presence.length > 0 && (
					<p className="text-xs text-gray-500">
						Online:{" "}
						{presence.map((u, i) => (
							<span key={u.userId}>
								{i > 0 ? ", " : null}
								<span className={chatAuthorNameClassName(u.isGuest)}>{u.displayName}</span>
							</span>
						))}
					</p>
				)}
				<form
					className="flex gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						const fd = new FormData(e.currentTarget);
						const text = String(fd.get("text") ?? "").trim();
						if (!text || !ready) {
							return;
						}
						void send.sendMessage({ text });
						e.currentTarget.reset();
					}}
				>
					<input
						name="text"
						className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-900"
						placeholder="Message…"
						autoComplete="off"
					/>
					<button
						type="submit"
						disabled={!ready}
						className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg"
					>
						Send
					</button>
				</form>
			</footer>
		</div>
	);
}
