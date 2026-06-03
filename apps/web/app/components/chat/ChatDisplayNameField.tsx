import type { FocusEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { chatAuthorNameClassName } from "~/components/chat/chat-display-name-styles";

type ChatDisplayNameFieldProps = {
	value: string;
	ready: boolean;
	isGuest: boolean;
	onChange: (value: string) => void;
	onSave: () => void;
	onRevert: () => void;
	onBeginEdit: () => void;
};

const inlineInputClass =
	"min-w-[6rem] max-w-full flex-1 border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5 bg-white dark:bg-gray-900 text-sm";

export function ChatDisplayNameField({
	value,
	ready,
	isGuest,
	onChange,
	onSave,
	onRevert,
	onBeginEdit,
}: ChatDisplayNameFieldProps) {
	const [editing, setEditing] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (editing) {
			inputRef.current?.focus();
			inputRef.current?.select();
		}
	}, [editing]);

	const stopEditing = () => {
		setEditing(false);
	};

	const revert = () => {
		onRevert();
		stopEditing();
	};

	const save = () => {
		if (!value.trim()) {
			revert();
			return;
		}
		onSave();
		stopEditing();
	};

	const onInputBlur = (e: FocusEvent<HTMLInputElement>) => {
		if (e.relatedTarget != null) {
			return;
		}
		revert();
	};

	const onInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Escape" && !e.nativeEvent.isComposing) {
			e.preventDefault();
			revert();
			return;
		}
		if (e.key === "Enter" && !e.nativeEvent.isComposing) {
			e.preventDefault();
			save();
		}
	};

	if (editing) {
		return (
			<input
				ref={inputRef}
				className={inlineInputClass}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onBlur={onInputBlur}
				onKeyDown={onInputKeyDown}
				placeholder="Display name"
				autoComplete="off"
				aria-label="Display name"
			/>
		);
	}

	const displayLabel = value.trim() || "Set name";

	return (
		<button
			type="button"
			disabled={!ready}
			title="Click to rename · Enter to save · Esc to cancel"
			className={`min-w-0 max-w-full truncate border-b border-dashed border-gray-400 dark:border-gray-500 text-left cursor-text hover:border-blue-500 dark:hover:border-blue-400 disabled:cursor-not-allowed disabled:opacity-50 ${chatAuthorNameClassName(isGuest)}`}
			onClick={() => {
				onBeginEdit();
				setEditing(true);
			}}
		>
			{displayLabel}
		</button>
	);
}
