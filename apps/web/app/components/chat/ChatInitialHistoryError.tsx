import { useEffect } from "react";

type ChatInitialHistoryErrorProps = {
	onError: () => void;
};

export function ChatInitialHistoryError({ onError }: ChatInitialHistoryErrorProps) {
	useEffect(() => {
		onError();
	}, [onError]);
	return (
		// biome-ignore lint/a11y/useSemanticElements: Virtualized chat uses ARIA roles on div rows.
		<div className="text-sm text-red-700 dark:text-red-300" role="listitem">
			Could not load message history.
		</div>
	);
}
