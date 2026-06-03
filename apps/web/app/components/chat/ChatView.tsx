import { hasAccountDisplayName } from "@internal/auth-client/display-name";
import type { AuthUser } from "@internal/auth-client/roles";
import {
	type FormEventHandler,
	type InputEventHandler,
	type KeyboardEvent as ReactKeyboardEvent,
	type ReactNode,
	type Ref,
	useCallback,
} from "react";
import { href, Link } from "react-router";
import { ChatGuestRetentionNotice } from "~/components/chat/ChatGuestRetentionNotice";
import { ChatRoomToolbar } from "~/components/chat/ChatRoomToolbar";
import { LocalDateTime } from "~/components/shared/LocalDateTime";
import { cn } from "~/lib/cn";

export type ChatViewToolbarProps = {
	nameDraft: string;
	ready: boolean;
	roomInput: string;
	committedRoom: string;
	canSwitchRoom: boolean;
	roomInputInvalid: boolean;
	joinIsRedundant: boolean;
	onNameChange: (value: string) => void;
	onSaveName: () => void;
	onRevertName: () => void;
	onBeginEditName: () => void;
	onRoomChange: (value: string) => void;
	onRoomKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
	onJoin: () => void;
};

type ChatViewProps = {
	user: AuthUser;
	sessionExpiresAt: string;
	guestRetentionDays: number;
	status: string;
	room: string;
	presenceSummary?: string | null;
	saveNameError?: string | undefined;
	deleteError?: string | undefined;
	socketError?: string | null | undefined;
	canModerate: boolean;
	toolbar: ChatViewToolbarProps;
	messageListRef?: Ref<HTMLDivElement>;
	onMessageListScroll?: () => void;
	messageInputDisabled?: boolean;
	sendDisabled?: boolean;
	onMessageSubmit?: (text: string) => void;
	children: ReactNode;
};

const CHAT_MESSAGE_LIST_MIN_H_CLASS = cn("min-h-[150px]");
const CHAT_MESSAGE_TEXTAREA_MAX_HEIGHT_PX = 144;

function resizeMessageTextArea(textarea: HTMLTextAreaElement): void {
	textarea.style.height = "auto";
	textarea.style.height = `${Math.min(textarea.scrollHeight, CHAT_MESSAGE_TEXTAREA_MAX_HEIGHT_PX)}px`;
}

export function ChatView({
	user,
	sessionExpiresAt,
	guestRetentionDays,
	status,
	room,
	presenceSummary,
	saveNameError,
	deleteError,
	socketError,
	canModerate,
	toolbar,
	messageListRef,
	onMessageListScroll,
	messageInputDisabled = false,
	sendDisabled = false,
	onMessageSubmit,
	children,
}: ChatViewProps) {
	const isAnonymousGuest = user.isAnonymous === true;
	const usesAccountName = !isAnonymousGuest && hasAccountDisplayName(user);
	const handleMessageFormSubmit: FormEventHandler<HTMLFormElement> = useCallback(
		(event) => {
			event.preventDefault();
			if (!onMessageSubmit) {
				return;
			}
			const text = String(new FormData(event.currentTarget).get("text") ?? "").trim();
			if (!text) {
				return;
			}
			onMessageSubmit(text);
			event.currentTarget.reset();
			const textarea = event.currentTarget.elements.namedItem("text");
			if (textarea instanceof HTMLTextAreaElement) {
				resizeMessageTextArea(textarea);
			}
		},
		[onMessageSubmit],
	);
	const handleMessageTextAreaInput: InputEventHandler<HTMLTextAreaElement> = useCallback(
		(event) => {
			resizeMessageTextArea(event.currentTarget);
		},
		[],
	);
	const handleMessageTextAreaKeyDown = useCallback(
		(event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
			if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
				return;
			}
			event.preventDefault();
			event.currentTarget.form?.requestSubmit();
		},
		[],
	);

	return (
		<div className="max-w-2xl mx-auto flex h-full min-h-0 w-full flex-col gap-2 overflow-hidden px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:gap-3 sm:py-3">
			<header className="shrink-0 space-y-2">
				<div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
					<h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">Chat</h1>
					<p className="text-xs text-gray-500 min-w-0 text-right">
						{status} · <span className="font-mono">{room}</span>
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
					nameDraft={toolbar.nameDraft}
					isGuest={isAnonymousGuest}
					ready={toolbar.ready}
					roomInput={toolbar.roomInput}
					committedRoom={toolbar.committedRoom}
					canSwitchRoom={toolbar.canSwitchRoom}
					roomInputInvalid={toolbar.roomInputInvalid}
					joinIsRedundant={toolbar.joinIsRedundant}
					onNameChange={toolbar.onNameChange}
					onSaveName={toolbar.onSaveName}
					onRevertName={toolbar.onRevertName}
					onBeginEditName={toolbar.onBeginEditName}
					onRoomChange={toolbar.onRoomChange}
					onRoomKeyDown={toolbar.onRoomKeyDown}
					onJoin={toolbar.onJoin}
				/>
			</div>

			<div className={cn("flex min-h-0 flex-1 flex-col", CHAT_MESSAGE_LIST_MIN_H_CLASS)}>
				{/* biome-ignore lint/a11y/useSemanticElements: TanStack Virtual chat needs a div scroll container with an inner measured spacer. */}
				<div
					ref={messageListRef}
					className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50"
					role="list"
					aria-label="Message history"
					onScroll={onMessageListScroll}
				>
					{children}
				</div>
			</div>

			<footer className="shrink-0 border-t border-gray-200 dark:border-gray-700 pt-2">
				<form className="flex items-end gap-2" onSubmit={handleMessageFormSubmit}>
					<textarea
						name="text"
						className="min-h-9 flex-1 resize-none overflow-y-auto rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm leading-5 dark:border-gray-600 dark:bg-gray-900 sm:px-3 sm:py-2"
						placeholder="Message..."
						autoComplete="off"
						disabled={messageInputDisabled}
						rows={1}
						onInput={handleMessageTextAreaInput}
						onKeyDown={handleMessageTextAreaKeyDown}
					/>
					<button
						type="submit"
						disabled={sendDisabled}
						className="shrink-0 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm"
					>
						Send
					</button>
				</form>
			</footer>
		</div>
	);
}
