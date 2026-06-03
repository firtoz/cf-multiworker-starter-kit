export function ChatWaitingMessages() {
	return (
		// biome-ignore lint/a11y/useSemanticElements: Virtualized chat uses ARIA roles on div rows.
		<div className="text-sm text-gray-500" role="listitem">
			Loading message history...
		</div>
	);
}
