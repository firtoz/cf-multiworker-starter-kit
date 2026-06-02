type ChatConnectingShellProps = {
	displayName: string;
	room: string;
	status: string;
};

export function ChatConnectingShell({ displayName, room, status }: ChatConnectingShellProps) {
	return (
		<div className="max-w-2xl mx-auto w-full min-h-full flex flex-col gap-2 px-4 py-2 sm:gap-3 sm:py-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
			<header className="shrink-0 space-y-2">
				<div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
					<h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">Chat</h1>
					<p className="text-xs text-gray-500 min-w-0 text-right">
						{status} · <span className="font-mono">{room}</span>
					</p>
				</div>
			</header>

			<div className="sticky top-0 z-10 shrink-0 -mx-4 border-b border-gray-200 bg-white/95 px-4 py-2 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-950/95">
				<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
					<span className="text-gray-500 dark:text-gray-400">Name:</span>
					<button
						type="button"
						disabled
						className="min-w-0 truncate border border-gray-300 bg-white px-2 py-1 text-left text-gray-700 disabled:opacity-70 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
					>
						{displayName}
					</button>
					<span className="text-gray-300 dark:text-gray-700">|</span>
					<label className="text-gray-500 dark:text-gray-400" htmlFor="chat-room-loading">
						Room:
					</label>
					<input
						id="chat-room-loading"
						disabled
						value={room}
						className="w-32 border border-gray-300 bg-white px-2 py-1 font-mono text-gray-700 disabled:opacity-70 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
						readOnly
					/>
					<button
						type="button"
						disabled
						className="bg-blue-600 px-3 py-1 font-medium text-white disabled:opacity-50"
					>
						Go
					</button>
				</div>
			</div>

			<div className="flex-1 flex flex-col min-h-[150px]">
				<ul
					className="flex min-h-0 flex-1 flex-col list-none gap-2 overflow-y-auto overscroll-contain border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-900/50"
					aria-label="Message history"
				/>
			</div>

			<footer className="shrink-0 border-t border-gray-200 dark:border-gray-700 pt-2">
				<div className="flex gap-2">
					<input
						disabled
						className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 sm:px-3 py-1.5 sm:py-2 bg-white dark:bg-gray-900 text-sm disabled:opacity-70"
						placeholder="Message..."
					/>
					<button
						type="button"
						disabled
						className="shrink-0 bg-green-600 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm disabled:opacity-50"
					>
						Send
					</button>
				</div>
			</footer>
		</div>
	);
}
