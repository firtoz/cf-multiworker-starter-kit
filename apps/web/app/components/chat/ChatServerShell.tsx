import { accountDisplayName, hasAccountDisplayName } from "@internal/auth-client/display-name";
import type { AuthUser } from "@internal/auth-client/roles";
import type { ChatMessageRow } from "@internal/chat-contract";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Suspense, useEffect } from "react";
import { Await, href, Link } from "react-router";
import { ChatGuestRetentionNotice } from "~/components/chat/ChatGuestRetentionNotice";
import { ChatInitialHistoryError } from "~/components/chat/ChatInitialHistoryError";
import { ChatInitialHistoryItems } from "~/components/chat/ChatInitialHistoryItems";
import { ChatRoomToolbar } from "~/components/chat/ChatRoomToolbar";
import { LocalDateTime } from "~/components/shared/LocalDateTime";
import { markChatPerformance } from "~/lib/chat-performance";

type ChatServerShellProps = {
	user: AuthUser;
	sessionExpiresAt: string;
	guestRetentionDays: number;
	room: string;
	status: string;
	initialMessages: Promise<ChatMessageRow[]>;
	canModerate: boolean;
	saveNameError?: string;
};

const noop = () => {
	// Static shell controls become interactive after hydration.
};

const noopString = (_value: string) => {
	// Static shell controls become interactive after hydration.
};

const noopKeyDown = (_event: ReactKeyboardEvent<HTMLInputElement>) => {
	// Static shell controls become interactive after hydration.
};

export function ChatServerShell({
	user,
	sessionExpiresAt,
	guestRetentionDays,
	room,
	status,
	initialMessages,
	canModerate,
	saveNameError,
}: ChatServerShellProps) {
	const isAnonymousGuest = user.isAnonymous === true;
	const usesAccountName = !isAnonymousGuest && hasAccountDisplayName(user);
	const displayName = accountDisplayName(user) ?? "Guest";

	useEffect(() => {
		markChatPerformance("static-shell-mounted");
	}, []);

	return (
		<div className="max-w-2xl mx-auto w-full min-h-full flex flex-col gap-2 px-4 py-2 sm:gap-3 sm:py-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
			<header className="shrink-0 space-y-2">
				<div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
					<h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">Chat</h1>
					<p className="text-xs text-gray-500 min-w-0 text-right">
						{status} · <span className="font-mono">{room}</span>
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
			</header>

			<div className="sticky top-0 z-10 shrink-0 -mx-4 border-b border-gray-200 bg-white/95 px-4 py-2 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-950/95">
				<ChatRoomToolbar
					nameDraft={displayName}
					isGuest={isAnonymousGuest}
					ready={false}
					roomInput={room}
					committedRoom={room}
					canSwitchRoom={false}
					roomInputInvalid={false}
					joinIsRedundant={true}
					onNameChange={noopString}
					onSaveName={noop}
					onRevertName={noop}
					onBeginEditName={noop}
					onRoomChange={noopString}
					onRoomKeyDown={noopKeyDown}
					onJoin={noop}
				/>
			</div>

			<div className="flex-1 flex flex-col min-h-[150px]">
				<ul className="flex min-h-0 flex-1 flex-col list-none gap-2 overflow-y-auto overscroll-contain border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-900/50">
					<Suspense
						fallback={<li className="text-sm text-gray-500">Loading message history...</li>}
					>
						<Await
							resolve={initialMessages}
							errorElement={<ChatInitialHistoryError onError={noop} />}
						>
							{(messages) => <ChatInitialHistoryItems messages={messages} />}
						</Await>
					</Suspense>
				</ul>
			</div>

			<footer className="shrink-0 border-t border-gray-200 dark:border-gray-700 pt-2">
				<form className="flex gap-2">
					<input
						name="text"
						className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 sm:px-3 py-1.5 sm:py-2 bg-white dark:bg-gray-900 text-sm"
						placeholder="Message..."
						autoComplete="off"
						disabled
					/>
					<button
						type="submit"
						disabled
						className="shrink-0 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm"
					>
						Send
					</button>
				</form>
			</footer>
		</div>
	);
}
