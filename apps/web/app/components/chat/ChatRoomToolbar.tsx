import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { ChatDisplayNameField } from "~/components/chat/ChatDisplayNameField";
import { cn } from "~/lib/cn";

type ChatRoomToolbarProps = {
	nameDraft: string;
	isGuest: boolean;
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
	onRoomKeyDown: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
	onJoin: () => void;
};

const labelClass = "shrink-0 text-gray-600 dark:text-gray-400";
const roomInputClass =
	"w-24 sm:w-28 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-900 font-mono text-sm min-w-0";

function goButtonTitle(
	canSwitchRoom: boolean,
	joinIsRedundant: boolean,
	roomInputInvalid: boolean,
	committedRoom: string,
): string | undefined {
	if (canSwitchRoom) {
		return undefined;
	}
	if (roomInputInvalid) {
		return "Room id: letters, numbers, underscore, hyphen only";
	}
	if (joinIsRedundant) {
		return `Already in ${committedRoom} — type another room name, then Go`;
	}
	return "Connecting…";
}

export function ChatRoomToolbar({
	nameDraft,
	isGuest,
	ready,
	roomInput,
	committedRoom,
	canSwitchRoom,
	roomInputInvalid,
	joinIsRedundant,
	onNameChange,
	onSaveName,
	onRevertName,
	onBeginEditName,
	onRoomChange,
	onRoomKeyDown,
	onJoin,
}: ChatRoomToolbarProps) {
	const goTitle = goButtonTitle(canSwitchRoom, joinIsRedundant, roomInputInvalid, committedRoom);

	return (
		<div className="flex min-w-0 items-center gap-2 text-sm">
			<div className="flex min-w-0 flex-1 items-center gap-1.5">
				<span className={labelClass}>Name:</span>
				<ChatDisplayNameField
					value={nameDraft}
					ready={ready}
					isGuest={isGuest}
					onChange={onNameChange}
					onSave={onSaveName}
					onRevert={onRevertName}
					onBeginEdit={onBeginEditName}
				/>
			</div>

			<span className="shrink-0 text-gray-300 dark:text-gray-600 select-none" aria-hidden>
				|
			</span>

			<div className="flex shrink-0 items-center gap-1.5">
				<span className={labelClass}>Room:</span>
				<input
					className={cn(roomInputClass, { "border-red-500 dark:border-red-400": roomInputInvalid })}
					value={roomInput}
					onChange={(e) => onRoomChange(e.target.value)}
					onKeyDown={onRoomKeyDown}
					placeholder="lobby"
					autoComplete="off"
					aria-label="Room"
					aria-invalid={roomInputInvalid}
					title={
						roomInputInvalid
							? "Use letters, numbers, underscore, or hyphen only"
							: "Spaces become dashes; then Go (Enter also works)"
					}
				/>
				<button
					id="chat-join"
					type="button"
					className="shrink-0 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed disabled:hover:bg-gray-400 text-white font-medium px-2.5 sm:px-3 py-1 rounded-lg text-sm"
					onClick={onJoin}
					disabled={!canSwitchRoom}
					title={goTitle}
				>
					Go
				</button>
			</div>
		</div>
	);
}
